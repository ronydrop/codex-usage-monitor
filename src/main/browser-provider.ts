import { access, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { AppLogger } from "./logger";

export type DevToolsEndpoint = {
  port: number;
  browserPath: string;
  endpoint: string;
};

type ChromeLaunchInput = {
  profilePath: string;
  url: string;
};

type ChromeSession = {
  accountId: string;
  profilePath: string;
  process?: ChildProcess;
  browser?: Browser;
  context?: BrowserContext;
  endpoint: string;
};

type ChromePageSession = ChromeSession & {
  page: Page;
};

export const DEFAULT_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

const DEVTOOLS_ACTIVE_PORT_FILE = "DevToolsActivePort";
const CHROME_START_TIMEOUT_MS = 20_000;

export function getChromeProfilePath(accountProfilePath: string): string {
  return join(accountProfilePath, "chrome-profile");
}

export function parseDevToolsActivePort(content: string): DevToolsEndpoint {
  const [portLine, browserPathLine] = content.split(/\r?\n/);
  const port = Number.parseInt(portLine, 10);

  if (!Number.isInteger(port) || port <= 0 || !browserPathLine?.trim()) {
    throw new Error("DevToolsActivePort inválido.");
  }

  return {
    port,
    browserPath: browserPathLine.trim(),
    endpoint: `http://127.0.0.1:${port}`
  };
}

export function buildSystemChromeArgs({ profilePath, url }: ChromeLaunchInput): string[] {
  return [
    `--user-data-dir=${profilePath}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    url
  ];
}

export function buildInteractiveChromeArgs({ profilePath, url }: ChromeLaunchInput): string[] {
  return [
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--new-window",
    url
  ];
}

export async function findSystemChromeExecutable(candidatePaths = DEFAULT_CHROME_PATHS): Promise<string | null> {
  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath, constants.X_OK);
      return candidatePath;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export class SystemChromeProvider {
  private readonly sessions = new Map<string, ChromeSession>();

  constructor(
    private readonly logger: AppLogger,
    private readonly chromePaths = DEFAULT_CHROME_PATHS
  ) {}

  async openPage(accountId: string, accountProfilePath: string, url: string): Promise<ChromePageSession> {
    const profilePath = getChromeProfilePath(accountProfilePath);
    const session = await this.getOrCreateSession(accountId, profilePath, url);
    const context = session.context ?? session.browser?.contexts()[0];

    if (!context) {
      this.sessions.delete(accountId);
      throw new Error("Chrome abriu, mas não expôs um contexto CDP.");
    }

    session.context = context;
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.bringToFront().catch(() => undefined);

    return { ...session, page };
  }

  async openInteractivePage(accountId: string, accountProfilePath: string, url: string): Promise<void> {
    const profilePath = getChromeProfilePath(accountProfilePath);
    await this.close(accountId);
    await mkdir(profilePath, { recursive: true });

    const chromePath = await findSystemChromeExecutable(this.chromePaths);
    if (!chromePath) {
      throw new Error("Chrome não encontrado. Instale o Google Chrome ou ajuste o caminho do executável.");
    }

    const child = spawn(chromePath, buildInteractiveChromeArgs({ profilePath, url }), {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });

    child.unref();
    await this.logger.info("Chrome interativo aberto para login/captcha", { accountId });
  }

  async close(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) {
      return;
    }

    this.sessions.delete(accountId);
    await session.browser?.close().catch(() => undefined);
    session.process?.kill();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((accountId) => this.close(accountId)));
  }

  private async getOrCreateSession(accountId: string, profilePath: string, url: string): Promise<ChromeSession> {
    const existing = this.sessions.get(accountId);
    if (existing && this.isSessionAlive(existing)) {
      return existing;
    }

    await this.close(accountId);
    await mkdir(profilePath, { recursive: true });
    await rm(join(profilePath, DEVTOOLS_ACTIVE_PORT_FILE), { force: true });

    const chromePath = await findSystemChromeExecutable(this.chromePaths);
    if (!chromePath) {
      throw new Error("Chrome não encontrado. Instale o Google Chrome ou ajuste o caminho do executável.");
    }

    const child = spawn(chromePath, buildSystemChromeArgs({ profilePath, url }), {
      detached: false,
      stdio: "ignore",
      windowsHide: false
    });

    child.once("exit", () => {
      this.sessions.delete(accountId);
    });

    const endpoint = await waitForDevToolsEndpoint(profilePath);
    const browser = await chromium.connectOverCDP(endpoint.endpoint);
    const context = browser.contexts()[0];
    const session: ChromeSession = { accountId, profilePath, process: child, browser, context, endpoint: endpoint.endpoint };

    this.sessions.set(accountId, session);
    await this.logger.info("Chrome real aberto para login/coleta", { accountId, endpoint: endpoint.endpoint });
    return session;
  }

  private isSessionAlive(session: ChromeSession): boolean {
    return Boolean(session.browser?.isConnected() && (!session.process || session.process.exitCode === null));
  }
}

async function waitForDevToolsEndpoint(profilePath: string, timeoutMs = CHROME_START_TIMEOUT_MS): Promise<DevToolsEndpoint> {
  const filePath = join(profilePath, DEVTOOLS_ACTIVE_PORT_FILE);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return parseDevToolsActivePort(await readFile(filePath, "utf8"));
    } catch {
      await delay(250);
    }
  }

  throw new Error("Chrome abriu, mas a porta CDP não ficou disponível a tempo.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
