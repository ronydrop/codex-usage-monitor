import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, AppState, IpcResult, ManualUsageInput, UpdateState } from "../shared/types";

const api = {
  getState: (): Promise<IpcResult<AppState>> => ipcRenderer.invoke("state:get"),
  refreshAccount: (accountId: string): Promise<IpcResult<AppState>> => ipcRenderer.invoke("account:refresh", accountId),
  refreshAll: (): Promise<IpcResult<AppState>> => ipcRenderer.invoke("account:refresh-all"),
  updateLabel: (accountId: string, label: string): Promise<IpcResult<AppState>> =>
    ipcRenderer.invoke("account:update-label", accountId, label),
  saveManualUsage: (accountId: string, input: ManualUsageInput): Promise<IpcResult<AppState>> =>
    ipcRenderer.invoke("account:manual-usage", accountId, input),
  saveSettings: (settings: Partial<AppSettings>): Promise<IpcResult<AppState>> =>
    ipcRenderer.invoke("settings:save", settings),
  addAccount: (): Promise<IpcResult<AppState>> => ipcRenderer.invoke("account:add"),
  removeAccount: (accountId: string): Promise<IpcResult<AppState>> =>
    ipcRenderer.invoke("account:remove", accountId),
  openLogsDir: (): Promise<IpcResult<void>> => ipcRenderer.invoke("logs:open"),
  hideWindow: (): Promise<IpcResult<void>> => ipcRenderer.invoke("window:hide"),
  getUpdateState: (): Promise<IpcResult<UpdateState>> => ipcRenderer.invoke("update:get"),
  checkForUpdates: (): Promise<IpcResult<UpdateState>> => ipcRenderer.invoke("update:check"),
  installUpdate: (): Promise<IpcResult<UpdateState>> => ipcRenderer.invoke("update:install"),
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onUpdateChanged: (callback: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on("update:changed", listener);
    return () => ipcRenderer.removeListener("update:changed", listener);
  }
};

contextBridge.exposeInMainWorld("codexUsage", api);

export type CodexUsageApi = typeof api;
