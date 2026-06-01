import type { CodexUsageApi } from "../../main/preload";

declare global {
  interface Window {
    codexUsage?: CodexUsageApi;
  }
}

export {};

