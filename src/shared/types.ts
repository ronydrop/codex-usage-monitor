export type AccountStatus = "ok" | "needs_login" | "captcha" | "offline" | "parse_error" | "refreshing";

export type UsageWindow = {
  label: string;
  remainingPercent: number;
  usedPercent: number;
  resetText?: string;
  rawText: string;
};

export type AccountUsage = {
  id: string;
  label: string;
  profilePath: string;
  status: AccountStatus;
  usedPercent?: number;
  remainingPercent?: number;
  resetText?: string;
  lastCheckedAt?: string;
  stale: boolean;
  windows?: UsageWindow[];
  errorMessage?: string;
};

export type UsageParseResult = {
  usedPercent: number;
  remainingPercent: number;
  resetText?: string;
  windows: UsageWindow[];
};

export type AppSettings = {
  usageUrl: string;
  refreshIntervalMinutes: number;
  refreshInBackground: boolean;
  startWithWindows: boolean;
};

export type ManualUsageInput = {
  remainingPercent: number;
  resetText?: string;
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
