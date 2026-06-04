import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageWindow } from "../shared/types";
import { formatReset } from "../shared/reset";

export { formatReset };

export const AUTH_SKEW_MS = 5 * 60 * 1000;

export type CodexWindow = {
  usedPercent: number;
  windowMinutes: number;
  resetsAt?: number;
};

export type CodexRateLimits = {
  primary?: CodexWindow;
  secondary?: CodexWindow;
  planType?: string;
};

export type CodexSnapshot = {
  capturedAt: number;
  rateLimits: CodexRateLimits;
};

export type CodexActiveAccount = {
  accountId?: string;
  email?: string;
  planType?: string;
};

const ROLLOUT_PATTERN = /^rollout-.*\.jsonl$/;
const SESSIONS_DIR = "sessions";
const AUTH_FILE = "auth.json";
const MAX_SCANNED_FILES = 60;

export function getDefaultCodexHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim();
  return fromEnv || join(homedir(), ".codex");
}

export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const segment = token.split(".")[1];
  if (!segment) {
    return undefined;
  }

  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function parseActiveAccount(authRaw: string): CodexActiveAccount {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(authRaw);
  } catch {
    return {};
  }

  const tokens = (parsed.tokens ?? {}) as Record<string, unknown>;
  const idToken = typeof tokens.id_token === "string" ? tokens.id_token : undefined;
  const claims = idToken ? decodeJwtPayload(idToken) : undefined;
  const auth = (claims?.["https://api.openai.com/auth"] ?? {}) as Record<string, unknown>;

  const accountId =
    (typeof tokens.account_id === "string" && tokens.account_id) ||
    (typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined) ||
    undefined;

  return {
    accountId,
    email: typeof claims?.email === "string" ? claims.email : undefined,
    planType: typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined
  };
}

export function parseRateLimitLine(line: string): CodexSnapshot | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes("rate_limits")) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const payload = (parsed.payload ?? {}) as Record<string, unknown>;
  const raw = payload.rate_limits as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const rateLimits = mapRateLimits(raw);
  if (!rateLimits.primary && !rateLimits.secondary) {
    return null;
  }

  const timestamp = typeof parsed.timestamp === "string" ? Date.parse(parsed.timestamp) : NaN;

  return {
    capturedAt: Number.isNaN(timestamp) ? 0 : timestamp,
    rateLimits
  };
}

export function mapRateLimits(raw: Record<string, unknown>): CodexRateLimits {
  return {
    primary: mapWindow(raw.primary),
    secondary: mapWindow(raw.secondary),
    planType: typeof raw.plan_type === "string" ? raw.plan_type : undefined
  };
}

function mapWindow(value: unknown): CodexWindow | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const window = value as Record<string, unknown>;
  const usedPercent = Number(window.used_percent);
  if (!Number.isFinite(usedPercent)) {
    return undefined;
  }

  return {
    usedPercent,
    windowMinutes: Number.isFinite(Number(window.window_minutes)) ? Number(window.window_minutes) : 0,
    resetsAt: Number.isFinite(Number(window.resets_at)) ? Number(window.resets_at) : undefined
  };
}

export function labelForWindow(windowMinutes: number): string {
  if (windowMinutes === 10080) {
    return "Semanal";
  }

  if (windowMinutes === 1440) {
    return "Diário";
  }

  if (windowMinutes > 0 && windowMinutes % 60 === 0) {
    return `${windowMinutes / 60} h`;
  }

  return windowMinutes > 0 ? `${windowMinutes} min` : "Janela";
}

export function isSnapshotFresh(capturedAt: number, authModifiedAt: number | undefined): boolean {
  if (authModifiedAt === undefined) {
    return true;
  }

  return capturedAt >= authModifiedAt - AUTH_SKEW_MS;
}

export function buildWindows(rateLimits: CodexRateLimits, now: number): UsageWindow[] {
  const windows: UsageWindow[] = [];

  for (const window of [rateLimits.primary, rateLimits.secondary]) {
    if (!window) {
      continue;
    }

    const usedPercent = clampPercent(window.usedPercent);
    const remainingPercent = clampPercent(100 - window.usedPercent);
    const resetText = formatReset(window.resetsAt, now);

    windows.push({
      label: labelForWindow(window.windowMinutes),
      remainingPercent,
      usedPercent,
      resetText,
      resetsAt: window.resetsAt,
      rawText: `${usedPercent}% usado${resetText ? ` · ${resetText}` : ""}`
    });
  }

  return windows;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export async function readActiveAccount(codexHome: string): Promise<CodexActiveAccount> {
  try {
    const raw = await readFile(join(codexHome, AUTH_FILE), "utf8");
    return parseActiveAccount(raw);
  } catch {
    return {};
  }
}

export async function readAuthModifiedAt(codexHome: string): Promise<number | undefined> {
  try {
    return (await stat(join(codexHome, AUTH_FILE))).mtimeMs;
  } catch {
    return undefined;
  }
}

export async function findLatestSnapshot(codexHome: string): Promise<CodexSnapshot | null> {
  const files = await listRolloutFiles(join(codexHome, SESSIONS_DIR));
  const newest = files.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).slice(0, MAX_SCANNED_FILES);

  let latest: CodexSnapshot | null = null;

  for (const file of newest) {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      const snapshot = parseRateLimitLine(line);
      if (snapshot && (!latest || snapshot.capturedAt > latest.capturedAt)) {
        latest = snapshot;
      }
    }
  }

  return latest;
}

async function listRolloutFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (ROLLOUT_PATTERN.test(entry.name)) {
        found.push(full);
      }
    }
  }

  await walk(root);
  return found;
}
