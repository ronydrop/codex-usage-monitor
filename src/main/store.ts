import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AccountUsage, AppSettings, AppState } from "../shared/types";

const STORE_FILE = "state.json";

export const DEFAULT_USAGE_URL = "https://chatgpt.com/codex/settings/usage";

const DEFAULT_SETTINGS: AppSettings = {
  usageUrl: DEFAULT_USAGE_URL,
  refreshIntervalMinutes: 30,
  refreshInBackground: false,
  startWithWindows: false
};

export class AccountStore {
  private readonly statePath: string;

  constructor(private readonly baseDir: string) {
    this.statePath = join(baseDir, STORE_FILE);
  }

  async load(): Promise<AccountUsage[]> {
    return (await this.loadState()).accounts;
  }

  async loadState(): Promise<AppState> {
    await mkdir(this.baseDir, { recursive: true });

    try {
      const raw = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return this.normalizeState(parsed);
    } catch (error) {
      const state = this.createDefaultState();
      await this.saveState(state);
      return state;
    }
  }

  async saveState(state: AppState): Promise<AppState> {
    const normalized = this.normalizeState(state);
    await writeJsonAtomic(this.statePath, normalized);
    return normalized;
  }

  async updateAccount(accountId: string, patch: Partial<AccountUsage>): Promise<AccountUsage[]> {
    const state = await this.loadState();
    const accounts = state.accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            ...patch,
            id: account.id,
            profilePath: account.profilePath
          }
        : account
    );

    await this.saveState({ ...state, accounts });
    return accounts;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const state = await this.loadState();
    const settings = normalizeSettings({ ...state.settings, ...patch });
    await this.saveState({ ...state, settings });
    return settings;
  }

  private normalizeState(state: Partial<AppState>): AppState {
    const defaultState = this.createDefaultState();
    const accounts = defaultState.accounts.map((defaultAccount, index) => {
      const existing = state.accounts?.find((account) => account.id === defaultAccount.id) ?? state.accounts?.[index];

      return {
        ...defaultAccount,
        ...existing,
        id: defaultAccount.id,
        profilePath: defaultAccount.profilePath,
        label: existing?.label?.trim() || defaultAccount.label,
        status: existing?.status ?? defaultAccount.status,
        stale: existing?.stale ?? defaultAccount.stale
      };
    });

    return {
      accounts,
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...state.settings })
    };
  }

  private createDefaultState(): AppState {
    return {
      accounts: [1, 2, 3].map((number) => ({
        id: `account-${number}`,
        label: `Conta ${String.fromCharCode(64 + number)}`,
        profilePath: join(this.baseDir, "profiles", `account-${number}`),
        status: "needs_login",
        stale: true
      })),
      settings: DEFAULT_SETTINGS
    };
  }
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const refreshIntervalMinutes = Number.isFinite(settings.refreshIntervalMinutes)
    ? Math.min(240, Math.max(5, Math.round(settings.refreshIntervalMinutes)))
    : DEFAULT_SETTINGS.refreshIntervalMinutes;

  return {
    usageUrl: settings.usageUrl?.trim() || DEFAULT_USAGE_URL,
    refreshIntervalMinutes,
    refreshInBackground: Boolean(settings.refreshInBackground),
    startWithWindows: Boolean(settings.startWithWindows)
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}
