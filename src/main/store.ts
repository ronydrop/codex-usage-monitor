import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AccountStatus, AccountUsage, AppSettings, AppState } from "../shared/types";
import { getDefaultCodexHome } from "./codex-usage";

const STORE_FILE = "state.json";
let atomicWriteCounter = 0;

const VALID_STATUSES: AccountStatus[] = ["ok", "no_data", "offline", "refreshing"];

const DEFAULT_SETTINGS: AppSettings = {
  codexHome: "",
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

  async upsertAccount(account: AccountUsage): Promise<AccountUsage[]> {
    return this.enqueueMutation(async () => {
      const state = await this.readStateFromDisk();
      const existing = state.accounts.find((candidate) => candidate.id === account.id);
      const accounts = existing
        ? state.accounts.map((candidate) =>
            candidate.id === account.id ? { ...candidate, ...account, label: candidate.label } : candidate
          )
        : [...state.accounts, account];

      await this.writeNormalizedState({ ...state, accounts });
      return this.normalizeState({ ...state, accounts }).accounts;
    });
  }

  async updateAccount(accountId: string, patch: Partial<AccountUsage>): Promise<AccountUsage[]> {
    return this.enqueueMutation(async () => {
      const state = await this.readStateFromDisk();
      const accounts = state.accounts.map((account) =>
        account.id === accountId ? { ...account, ...patch, id: account.id } : account
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
    } catch {
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
    const accounts = (state.accounts ?? []).filter((account) => account && account.id).map(sanitizeAccount);

    return {
      accounts,
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...state.settings })
    };
  }

  private createDefaultState(): AppState {
    return {
      accounts: [],
      settings: { ...DEFAULT_SETTINGS }
    };
  }
}

function sanitizeAccount(account: AccountUsage): AccountUsage {
  const status: AccountStatus = VALID_STATUSES.includes(account.status)
    ? account.status === "refreshing"
      ? "no_data"
      : account.status
    : "no_data";

  return {
    ...account,
    id: account.id,
    label: account.label?.trim() || account.email || "Conta",
    status,
    stale: status === "ok" ? Boolean(account.stale) : true
  };
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const refreshIntervalMinutes = Number.isFinite(settings.refreshIntervalMinutes)
    ? Math.min(240, Math.max(5, Math.round(settings.refreshIntervalMinutes)))
    : DEFAULT_SETTINGS.refreshIntervalMinutes;

  return {
    codexHome: settings.codexHome?.trim() || "",
    refreshIntervalMinutes,
    refreshInBackground: Boolean(settings.refreshInBackground),
    startWithWindows: Boolean(settings.startWithWindows)
  };
}

export function resolveCodexHome(settings: AppSettings): string {
  return settings.codexHome?.trim() || getDefaultCodexHome();
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
