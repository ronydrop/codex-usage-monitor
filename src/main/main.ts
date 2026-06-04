import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, screen, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AccountUsage, AppSettings, AppState, IpcResult, UpdateState } from "../shared/types";
import { AccountRefreshLock } from "./refresh-lock";
import { AccountStore } from "./store";
import { UsageCollector } from "./collector";
import { AppLogger } from "./logger";
import { triggerExec } from "./codex-runner";
import { runLogin } from "./codex-login";
import { getDefaultCodexHome, type CodexActiveAccount } from "./codex-usage";
import { createInitialUpdateState, reduceUpdateState, type UpdateStateEvent } from "./update-state";
import { getBottomRightWindowBounds } from "./window-position";
import { createMainWindowOptions } from "./window-options";
import { hideWindowToTray, showWindowFromTray } from "./window-visibility";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WINDOW_SIZE = { width: 520, height: 640 };

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let store: AccountStore;
let collector: UsageCollector;
let logger: AppLogger;
let refreshTimer: NodeJS.Timeout | undefined;
let updateTimer: NodeJS.Timeout | undefined;
let updateState: UpdateState = createInitialUpdateState(app.getVersion());
let isQuitting = false;
const refreshLock = new AccountRefreshLock();

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  showWindow();
});

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";

  const userDataPath = app.getPath("userData");
  store = new AccountStore(userDataPath);
  logger = new AppLogger(userDataPath);
  collector = new UsageCollector(logger);

  await store.loadState();
  createWindow();
  createTray();
  registerIpcHandlers();
  configureAutoUpdater();
  await applyLoginItemSettings();
  await scheduleRefresh();
  void syncAllAccounts();
});

app.on("window-all-closed", () => undefined);

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (updateTimer) {
    clearInterval(updateTimer);
  }
});

function createWindow(): void {
  const bounds = getPreferredWindowBounds();

  mainWindow = new BrowserWindow(
    createMainWindowOptions({
      bounds,
      icon: createTrayIcon(),
      preloadPath: join(__dirname, "../preload/preload.mjs")
    })
  );
  mainWindow.setMenu(null);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindowToTray(mainWindow);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Codex Usage Monitor");
  tray.on("click", () => showWindow());
  updateTrayMenu();
}

function updateTrayMenu(): void {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Mostrar painel", click: () => showWindow() },
      { label: "Atualizar agora", click: () => void syncAllAccounts() },
      {
        label:
          updateState.status === "downloaded"
            ? `Instalar atualização ${updateState.latestVersion ?? ""}`.trim()
            : "Verificar atualizações",
        enabled: updateState.status !== "checking" && updateState.status !== "downloading",
        click: () =>
          updateState.status === "downloaded" ? void installDownloadedUpdate() : void checkForUpdates(true)
      },
      { type: "separator" },
      { label: "Sair", click: () => quitApp() }
    ])
  );
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
  }

  if (mainWindow) {
    showWindowFromTray(mainWindow, getPreferredWindowBounds());
  }
}

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

function createTrayIcon(): Electron.NativeImage {
  const b64 = "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";
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${b64}`);
  return process.platform === "win32" ? icon.resize({ width: 16, height: 16 }) : icon;
}

function getPreferredWindowBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return getBottomRightWindowBounds(display.workArea, WINDOW_SIZE);
}

function registerIpcHandlers(): void {
  ipcMain.handle("state:get", () => wrap(() => store.loadState()));
  ipcMain.handle("account:refresh", (_event, accountId: string) =>
    wrap(() => syncOneAccount(accountId))
  );
  ipcMain.handle("account:refresh-all", () => wrap(() => syncAllAccounts()));
  ipcMain.handle("account:add", () => wrap(() => addAccount()));
  ipcMain.handle("account:remove", (_event, accountId: string) =>
    wrap(() => removeAccount(accountId))
  );
  ipcMain.handle("account:update-label", (_event, accountId: string, label: string) =>
    wrap(() => updateLabel(accountId, label))
  );
  ipcMain.handle("account:delete", (_event, accountId: string) => wrap(() => deleteAccount(accountId)));
  ipcMain.handle("settings:save", (_event, settings: Partial<AppSettings>) => wrap(() => saveSettings(settings)));
  ipcMain.handle("logs:open", () => wrap(openLogsDir));
  ipcMain.handle("window:hide", () => wrap(hideMainWindow));
  ipcMain.handle("update:get", () => wrap(async () => updateState));
  ipcMain.handle("update:check", () => wrap(() => checkForUpdates(true)));
  ipcMain.handle("update:install", () => wrap(installDownloadedUpdate));
}

async function wrap<T>(operation: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger?.error("IPC operation failed", { message });
    return { ok: false, error: message };
  }
}

async function syncAllAccounts(): Promise<AppState> {
  const state = await store.loadState();
  const { settings, accounts } = state;

  const homesFromStore = accounts
    .filter((a) => Boolean(a.codexHome))
    .map((a) => ({ id: a.id, codexHome: a.codexHome as string }));

  const allHomes: Array<{ id: string | undefined; codexHome: string }> = [
    { id: undefined, codexHome: settings.codexHome || "" },
    ...homesFromStore
  ];

  for (const entry of allHomes) {
    await syncOneHome(entry.codexHome, settings);
  }

  return broadcastState();
}

async function syncOneAccount(accountId: string): Promise<AppState> {
  const state = await store.loadState();
  const account = state.accounts.find((a) => a.id === accountId);

  if (!account) {
    return state;
  }

  await syncOneHome(account.codexHome ?? "", state.settings);
  return broadcastState();
}

async function syncOneHome(codexHome: string, settings: AppSettings): Promise<void> {
  const lockKey = codexHome || "default";

  await refreshLock.run(lockKey, async () => {
    if (codexHome) {
      try {
        await triggerExec(codexHome);
      } catch (err) {
        await logger.warn("triggerExec falhou", {
          codexHome,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const resolvedHome = codexHome || settings.codexHome || getDefaultCodexHome();
    const { account, patch } = await collector.readUsageFor(resolvedHome);

    if (!account.accountId) {
      return;
    }

    const state = await store.loadState();
    const existing = state.accounts.find((a) => a.accountId === account.accountId);

    const base: AccountUsage = {
      id: account.accountId,
      label: existing?.label || account.email || "Conta Codex",
      accountId: account.accountId,
      email: account.email,
      planType: account.planType,
      codexHome: codexHome || undefined,
      status: "no_data",
      stale: true,
      ...patch
    };

    await store.upsertAccount(base);
  });
}

async function addAccount(): Promise<AppState> {
  const id = `account-${Date.now()}`;
  const codexHome = join(app.getPath("userData"), "homes", id);
  await mkdir(codexHome, { recursive: true });

  let account: CodexActiveAccount;
  try {
    account = await runLogin(codexHome, () => {
      mainWindow?.webContents.send("account:login-started");
    });
  } catch (error) {
    await rm(codexHome, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  if (!account.accountId) {
    await rm(codexHome, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("Login cancelado ou sem conta reconhecida.");
  }

  const duplicate = (await store.loadState()).accounts.find((a) => a.accountId === account.accountId);
  if (duplicate) {
    await rm(codexHome, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`Conta ${account.email ?? account.accountId} já está adicionada.`);
  }

  const base: AccountUsage = {
    id: account.accountId,
    label: account.email ?? "Conta Codex",
    accountId: account.accountId,
    email: account.email,
    planType: account.planType,
    codexHome,
    status: "no_data",
    stale: true
  };

  await store.upsertAccount(base);

  await syncOneHome(codexHome, (await store.loadState()).settings);

  return broadcastState();
}

async function removeAccount(accountId: string): Promise<AppState> {
  const state = await store.loadState();
  const account = state.accounts.find((a) => a.id === accountId);

  if (account?.codexHome) {
    await rm(account.codexHome, { recursive: true, force: true }).catch(() => undefined);
  }

  await store.removeAccount(accountId);
  return broadcastState();
}

async function updateLabel(accountId: string, label: string): Promise<AppState> {
  await store.updateAccount(accountId, { label: label.trim().slice(0, 40) || "Conta" });
  return broadcastState();
}

async function deleteAccount(accountId: string): Promise<AppState> {
  await store.removeAccount(accountId);
  return broadcastState();
}

async function saveSettings(settings: Partial<AppSettings>): Promise<AppState> {
  await store.updateSettings(settings);
  await applyLoginItemSettings();
  await scheduleRefresh();
  return broadcastState();
}

async function openLogsDir(): Promise<void> {
  await shell.openPath(join(app.getPath("userData"), "logs"));
}

async function hideMainWindow(): Promise<void> {
  hideWindowToTray(mainWindow);
}

async function broadcastState(): Promise<AppState> {
  const state = await store.loadState();
  mainWindow?.webContents.send("state:changed", state);
  return state;
}

function broadcastUpdateState(): UpdateState {
  mainWindow?.webContents.send("update:changed", updateState);
  return updateState;
}

async function scheduleRefresh(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  const { settings } = await store.loadState();
  refreshTimer = setInterval(
    () => {
      void syncAllAccounts();
    },
    settings.refreshIntervalMinutes * 60 * 1000
  );
}

async function applyLoginItemSettings(): Promise<void> {
  const { settings } = await store.loadState();
  app.setLoginItemSettings({
    openAtLogin: settings.startWithWindows,
    path: process.execPath
  });
}

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => setUpdateState({ type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    setUpdateState({ type: "available", latestVersion: info.version })
  );
  autoUpdater.on("update-not-available", (info) =>
    setUpdateState({ type: "not-available", latestVersion: info.version })
  );
  autoUpdater.on("download-progress", (progress) =>
    setUpdateState({
      type: "downloading",
      progressPercent: Math.round(progress.percent),
      latestVersion: updateState.latestVersion
    })
  );
  autoUpdater.on("update-downloaded", (info) =>
    setUpdateState({ type: "downloaded", latestVersion: info.version })
  );
  autoUpdater.on("error", (error) =>
    setUpdateState({
      type: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    })
  );

  if (!app.isPackaged) {
    setUpdateState({
      type: "disabled",
      errorMessage: "Atualizações automáticas ficam ativas no app instalado."
    });
    return;
  }

  setTimeout(() => void checkForUpdates(false), 6000);
  updateTimer = setInterval(() => void checkForUpdates(false), 6 * 60 * 60 * 1000);
}

function setUpdateState(event: UpdateStateEvent): UpdateState {
  updateState = reduceUpdateState(updateState, event);
  updateTrayMenu();
  return broadcastUpdateState();
}

async function checkForUpdates(manual: boolean): Promise<UpdateState> {
  if (!app.isPackaged) {
    return setUpdateState({
      type: "disabled",
      errorMessage: "Atualizações automáticas ficam ativas no app instalado."
    });
  }

  if (manual) {
    setUpdateState({ type: "checking" });
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateState({
      type: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return updateState;
}

async function installDownloadedUpdate(): Promise<UpdateState> {
  if (updateState.status !== "downloaded") {
    throw new Error("Nenhuma atualização baixada para instalar.");
  }

  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
  return updateState;
}
