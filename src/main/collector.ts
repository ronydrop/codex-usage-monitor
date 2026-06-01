import { mkdir } from "node:fs/promises";
import type { Page } from "playwright";
import type { AccountUsage, AppSettings } from "../shared/types";
import { parseUsageText } from "./usage-parser";
import type { AppLogger } from "./logger";
import { SystemChromeProvider } from "./browser-provider";

type CollectResult = Partial<AccountUsage>;

const NETWORK_ERROR_PATTERN = /(ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|net::|ENOTFOUND|ETIMEDOUT)/i;
const CAPTCHA_PATTERN = /(captcha|verify you are human|confirme que voc[eê] [eé] humano|cloudflare)/i;
const LOGIN_PATTERN = /(sign in|log in|entrar|login|continue with google|continue with microsoft)/i;
const CHATGPT_HOME_URL = "https://chatgpt.com/";

export class UsageCollector {
  constructor(
    private readonly logger: AppLogger,
    private readonly chromeProvider = new SystemChromeProvider(logger)
  ) {}

  async openLoginWindow(account: AccountUsage, settings: AppSettings): Promise<CollectResult> {
    await mkdir(account.profilePath, { recursive: true });

    const { page } = await this.chromeProvider.openPage(account.id, account.profilePath, getLoginStartUrl(settings));
    await page.bringToFront();

    return {
      status: "needs_login",
      stale: true,
      errorMessage: "Chrome dedicado aberto. Entre na conta, resolva a verificação se aparecer e clique em Atualizar."
    };
  }

  async closeLoginWindow(accountId: string): Promise<void> {
    await this.chromeProvider.close(accountId);
  }

  async closeAll(): Promise<void> {
    await this.chromeProvider.closeAll();
  }

  async collect(account: AccountUsage, settings: AppSettings): Promise<CollectResult> {
    await mkdir(account.profilePath, { recursive: true });

    try {
      const page = await this.openUsagePage(account, settings);
      const { pageText, url } = await readPageState(page);

      if (CAPTCHA_PATTERN.test(pageText)) {
        return {
          status: "captcha",
          stale: true,
          lastCheckedAt: new Date().toISOString(),
          errorMessage: "Resolva a verificação no Chrome aberto e clique em Atualizar."
        };
      }

      if (isLoginPage(url, pageText)) {
        return {
          status: "needs_login",
          stale: true,
          lastCheckedAt: new Date().toISOString(),
          errorMessage: "Entre no Chrome dedicado desta conta e clique em Atualizar."
        };
      }

      const parsed = parseUsageText(pageText);
      if (!parsed) {
        await this.logger.warn("Usage parser did not find a percentage", { accountId: account.id, url });
        return {
          status: "parse_error",
          stale: true,
          lastCheckedAt: new Date().toISOString(),
          errorMessage: "Não consegui ler o percentual na página de uso."
        };
      }

      return {
        status: "ok",
        stale: false,
        remainingPercent: parsed.remainingPercent,
        usedPercent: parsed.usedPercent,
        resetText: parsed.resetText,
        windows: parsed.windows,
        lastCheckedAt: new Date().toISOString(),
        errorMessage: undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logger.warn("Usage refresh failed", { accountId: account.id, message });

      return {
        status: NETWORK_ERROR_PATTERN.test(message) ? "offline" : "parse_error",
        stale: true,
        lastCheckedAt: new Date().toISOString(),
        errorMessage: NETWORK_ERROR_PATTERN.test(message)
          ? "Sem internet ou serviço indisponível."
          : "Falha ao abrir ou interpretar a página de uso."
      };
    }
  }

  private async openUsagePage(account: AccountUsage, settings: AppSettings): Promise<Page> {
    const shouldStabilizeSession = account.status === "needs_login" || account.status === "captcha";

    if (shouldStabilizeSession) {
      const { page } = await this.chromeProvider.openPage(account.id, account.profilePath, CHATGPT_HOME_URL);
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
      const { pageText, url } = await readPageState(page);

      if (CAPTCHA_PATTERN.test(pageText) || isLoginPage(url, pageText)) {
        return page;
      }
    }

    const { page } = await this.chromeProvider.openPage(account.id, account.profilePath, settings.usageUrl);
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
    return page;
  }
}

function isLoginPage(url: string, text: string): boolean {
  const normalizedUrl = url.toLocaleLowerCase();
  const normalizedText = text.toLocaleLowerCase();

  return normalizedUrl.includes("/auth/login") || normalizedUrl.includes("auth0") || LOGIN_PATTERN.test(normalizedText);
}

async function readPageState(page: Page): Promise<{ pageText: string; url: string }> {
  return {
    pageText: await page.locator("body").innerText({ timeout: 12_000 }),
    url: page.url()
  };
}

function getLoginStartUrl(settings: AppSettings): string {
  try {
    const usageUrl = new URL(settings.usageUrl);
    return `${usageUrl.protocol}//${usageUrl.host}/`;
  } catch {
    return CHATGPT_HOME_URL;
  }
}
