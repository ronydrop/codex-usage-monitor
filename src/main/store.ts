import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AccountUsage, AppSettings, AppState } from "../shared/types";

const STORE_FILE = "state.json";
const INTERRUPTED_REFRESH_MESSAGE = "Atualização anterior foi interrompida. Clique em Atualizar.";
let atomicWriteCounter = 0;

export const DEFAULT_USAGE_URL = "https://chatgpt.com/codex/settings/usage";

const DEFAULT_SETTINGS: AppSettings = {
  usageUrl: DEFAULT_USAGE_URL,
  refreshIntervalMinutes: 30,
  refreshInBackground: false,
  startWithWindows: false
};

export class AccountStore {
  private readonly statePath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly baseDir: string) {
    this.statePath = join(baseDir, STORE_FILE);
  }

  async load(): Promise<AccountUsage[]> {
    return (await this.loadState()).accounts;
  }

  async loadState(): Promise<AppState> {
    await this.mutationQueue.catch(() => undefined);
    return this.readStateFromDisk();
  }

  async saveState(state: AppState): Promise<AppState> {
    return this.enqueueMutation(async () => {
      const normalized = this.normalizeState(state);
      await writeJsonAtomic(this.statePath, normalized);
      return normalized;
    });
  }

  async updateAccount(accountId: string, patch: Partial<AccountUsage>): Promise<AccountUsage[]> {
    return this.enqueueMutation(async () => {
      const state = await this.readStateFromDisk();
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

      await this.writeNormalizedState({ ...state, accounts });
      return accounts;
    });
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return this.enqueueMutation(async () => {
      const state = await this.readStateFromDisk();
      const settings = normalizeSettings({ ...state.settings, ...patch });
      await this.writeNormalizedState({ ...state, settings });
      return settings;
    });
  }

  private async readStateFromDisk(): Promise<AppState> {
    await mkdir(this.baseDir, { recursive: true });

    try {
      const raw = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return this.normalizeState(parsed);
    } catch (error) {
      const state = this.createDefaultState();
      await this.writeNormalizedState(state);
      return state;
    }
  }

  private async writeNormalizedState(state: AppState): Promise<AppState> {
    const normalized = this.normalizeState(state);
    await writeJsonAtomic(this.statePath, normalized);
    return normalized;
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.mutationQueue.then(operation, operation);
    this.mutationQueue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private normalizeState(state: Partial<AppState>): AppState {
    const defaultState = this.createDefaultState();
    const accounts = defaultState.accounts.map((defaultAccount, index) => {
      const existing = state.accounts?.find((account) => account.id === defaultAccount.id) ?? state.accounts?.[index];
      const interruptedRefresh = existing?.status === "refreshing";

      return {
        ...defaultAccount,
        ...existing,
        id: defaultAccount.id,
        profilePath: defaultAccount.profilePath,
        label: existing?.label?.trim() || defaultAccount.label,
        status: interruptedRefresh ? "parse_error" : (existing?.status ?? defaultAccount.status),
        stale: interruptedRefresh ? true : (existing?.stale ?? defaultAccount.stale),
        errorMessage: interruptedRefresh ? INTERRUPTED_REFRESH_MESSAGE : existing?.errorMessage
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
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${atomicWriteCounter++}.tmp`;

  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
