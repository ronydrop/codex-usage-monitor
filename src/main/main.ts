import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, screen, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AccountUsage, AppSettings, AppState, IpcResult, ManualUsageInput, UpdateState } from "../shared/types";
import { AccountRefreshLock } from "./refresh-lock";
import { AccountStore } from "./store";
import { UsageCollector } from "./collector";
import { AppLogger } from "./logger";
import { triggerExec } from "./codex-runner";
import { runLogin } from "./codex-login";
import { getDefaultCodexHome } from "./codex-usage";
import { createInitialUpdateState, reduceUpdateState, type UpdateStateEvent } from "./update-state";
import { getBottomRightWindowBounds } from "./window-position";
import { createMainWindowOptions } from "./window-options";

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
      mainWindow?.minimize();
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

  positionMainWindow();
  mainWindow?.show();
  mainWindow?.focus();
}

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

function createTrayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <path fill="#60a5fa" d="M12.8 9.4 6.2 16l6.6 6.6 2.4-2.4-4.2-4.2 4.2-4.2-2.4-2.4Z"/>
      <path fill="#60a5fa" d="m19.2 9.4-2.4 2.4 4.2 4.2-4.2 4.2 2.4 2.4 6.6-6.6-6.6-6.6Z"/>
      <path fill="#4ade80" d="M18.7 6.1c1 .3 1.6 1.3 1.3 2.3l-5 17.4c-.3 1-1.3 1.6-2.3 1.3s-1.6-1.3-1.3-2.3l5-17.4c.3-1 1.3-1.6 2.3-1.3Z"/>
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  return process.platform === "win32" ? icon.resize({ width: 16, height: 16 }) : icon;
}

function getPreferredWindowBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return getBottomRightWindowBounds(display.workArea, WINDOW_SIZE);
}

function positionMainWindow(): void {
  mainWindow?.setBounds(getPreferredWindowBounds(), false);
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
  ipcMain.handle("account:manual-usage", (_event, accountId: string, input: ManualUsageInput) =>
    wrap(() => saveManualUsage(accountId, input))
  );
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
    .filter((a) => !a.manual && a.codexHome)
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

  const account = await runLogin(codexHome, () => {
    mainWindow?.webContents.send("account:login-started");
  });

  if (!account.accountId) {
    await rm(codexHome, { recursive: true, force: true });
    throw new Error("Login cancelado ou sem conta reconhecida.");
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

async function saveManualUsage(accountId: string, input: ManualUsageInput): Promise<AppState> {
  const remainingPercent = Math.min(100, Math.max(0, Math.round(input.remainingPercent)));
  await store.updateAccount(accountId, {
    status: "ok",
    stale: false,
    manual: true,
    remainingPercent,
    usedPercent: 100 - remainingPercent,
    resetText: input.resetText?.trim() || undefined,
    lastCheckedAt: new Date().toISOString(),
    windows: [
      {
        label: "Manual",
        remainingPercent,
        usedPercent: 100 - remainingPercent,
        resetText: input.resetText?.trim() || undefined,
        rawText: `${remainingPercent}% ${input.resetText ?? ""}`.trim()
      }
    ],
    errorMessage: undefined
  });
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
  mainWindow?.minimize();
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

