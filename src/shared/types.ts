export type AccountStatus = "ok" | "no_data" | "offline" | "refreshing";

export type UsageWindow = {
  label: string;
  remainingPercent: number;
  usedPercent: number;
  resetText?: string;
  resetsAt?: number;
  rawText: string;
};

export type AccountUsage = {
  id: string;
  label: string;
  accountId?: string;
  email?: string;
  planType?: string;
  status: AccountStatus;
  usedPercent?: number;
  remainingPercent?: number;
  resetText?: string;
  resetsAt?: number;
  lastCheckedAt?: string;
  stale: boolean;
  windows?: UsageWindow[];
  errorMessage?: string;
};

export type AppSettings = {
  codexHome: string;
  refreshIntervalMinutes: number;
  refreshInBackground: boolean;
  startWithWindows: boolean;
};

export type AppState = {
  accounts: AccountUsage[];
  settings: AppSettings;
};

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "disabled"
  | "error";

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  checkedAt?: string;
  progressPercent?: number;
  errorMessage?: string;
};

export type IpcResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
};
