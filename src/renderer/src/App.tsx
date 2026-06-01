import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  LogIn,
  PackageCheck,
  Pencil,
  RefreshCcw,
  Save,
  Settings,
  ShieldCheck,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccountUsage, AppSettings, AppState, IpcResult, ManualUsageInput, UpdateState } from "../../shared/types";

type PendingAction = string | undefined;

const fallbackState: AppState = {
  settings: {
    usageUrl: "https://chatgpt.com/codex/settings/usage",
    refreshIntervalMinutes: 30,
    refreshInBackground: false,
    startWithWindows: false
  },
  accounts: [
    {
      id: "account-1",
      label: "Conta A",
      profilePath: "preview/account-1",
      status: "ok",
      remainingPercent: 68,
      usedPercent: 32,
      resetText: "07:08",
      stale: false,
      lastCheckedAt: new Date().toISOString(),
      windows: [
        { label: "5 h", remainingPercent: 68, usedPercent: 32, resetText: "07:08", rawText: "68% 07:08" },
        { label: "Semanal", remainingPercent: 93, usedPercent: 7, resetText: "8 de jun.", rawText: "93% 8 de jun." }
      ]
    },
    {
      id: "account-2",
      label: "Conta B",
      profilePath: "preview/account-2",
      status: "needs_login",
      stale: true,
      errorMessage: "Sessão não configurada."
    },
    {
      id: "account-3",
      label: "Conta C",
      profilePath: "preview/account-3",
      status: "parse_error",
      remainingPercent: 44,
      usedPercent: 56,
      resetText: "8 de jun.",
      stale: true,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: "Última leitura ficou stale."
    }
  ]
};

const fallbackUpdateState: UpdateState = {
  status: "disabled",
  currentVersion: "0.1.0",
  errorMessage: "Atualizações automáticas ficam ativas no app instalado."
};

const previewApi = {
  getState: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  refreshAccount: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  refreshAll: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  openLogin: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  updateLabel: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  saveManualUsage: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  saveSettings: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  openLogsDir: async (): Promise<IpcResult<void>> => ({ ok: true, data: undefined }),
  hideWindow: async (): Promise<IpcResult<void>> => ({ ok: true, data: undefined }),
  getUpdateState: async (): Promise<IpcResult<UpdateState>> => ({ ok: true, data: fallbackUpdateState }),
  checkForUpdates: async (): Promise<IpcResult<UpdateState>> => ({ ok: true, data: fallbackUpdateState }),
  installUpdate: async (): Promise<IpcResult<UpdateState>> => ({ ok: true, data: fallbackUpdateState }),
  onStateChanged: () => () => undefined,
  onUpdateChanged: () => () => undefined
};

const api = window.codexUsage ?? previewApi;

export function App() {
  const [state, setState] = useState<AppState | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [editingLabelId, setEditingLabelId] = useState<string | undefined>();
  const [labelDraft, setLabelDraft] = useState("");
  const [manualAccountId, setManualAccountId] = useState<string | undefined>();
  const [manualPercent, setManualPercent] = useState("50");
  const [manualReset, setManualReset] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | undefined>();
  const [updateState, setUpdateState] = useState<UpdateState | undefined>();

  useEffect(() => {
    void loadState();
    void loadUpdateState();
    const removeStateListener = api.onStateChanged((nextState) => {
      setState(nextState);
      setSettingsDraft(nextState.settings);
    });
    const removeUpdateListener = api.onUpdateChanged(setUpdateState);

    return () => {
      removeStateListener();
      removeUpdateListener();
    };
  }, []);

  const accountSummary = useMemo(() => {
    if (!state) {
      return "Carregando";
    }

    const ok = state.accounts.filter((account) => account.status === "ok").length;
    return `${ok}/${state.accounts.length} contas lidas`;
  }, [state]);

  async function loadState() {
    await callApi("load", () => api.getState());
  }

  async function loadUpdateState() {
    await callUpdateApi("update-load", () => api.getUpdateState());
  }

  async function callApi<T>(action: string, operation: () => Promise<IpcResult<T>>) {
    setPendingAction(action);
    setError(undefined);
    const result = await operation();
    setPendingAction(undefined);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (isAppState(result.data)) {
      setState(result.data);
      setSettingsDraft(result.data.settings);
    }
  }

  async function callUpdateApi(action: string, operation: () => Promise<IpcResult<UpdateState>>) {
    setPendingAction(action);
    setError(undefined);
    const result = await operation();
    setPendingAction(undefined);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setUpdateState(result.data);
  }

  function beginEditLabel(account: AccountUsage) {
    setEditingLabelId(account.id);
    setLabelDraft(account.label);
  }

  function beginManual(account: AccountUsage) {
    setManualAccountId(account.id);
    setManualPercent(String(account.remainingPercent ?? 50));
    setManualReset(account.resetText ?? "");
  }

  async function saveManualUsage() {
    if (!manualAccountId) {
      return;
    }

    const payload: ManualUsageInput = {
      remainingPercent: Number.parseInt(manualPercent, 10),
      resetText: manualReset
    };

    await callApi(`manual-${manualAccountId}`, () => api.saveManualUsage(manualAccountId, payload));
    setManualAccountId(undefined);
  }

  async function saveSettings() {
    if (!settingsDraft) {
      return;
    }

    await callApi("settings", () => api.saveSettings(settingsDraft));
  }

  if (!state || !settingsDraft) {
    return (
      <main className="app-shell loading">
        <RefreshCcw className="spin" aria-hidden />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Uso Codex</h1>
          <p>{accountSummary}</p>
        </div>
        <div className="topbar-actions">
          <IconButton
            title="Atualizar todas"
            busy={pendingAction === "refresh-all"}
            onClick={() => callApi("refresh-all", () => api.refreshAll())}
          >
            <RefreshCcw />
          </IconButton>
          <IconButton title="Configurações" active={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>
            <Settings />
          </IconButton>
          <IconButton title="Ocultar painel" onClick={() => callApi("hide", () => api.hideWindow())}>
            <X />
          </IconButton>
        </div>
      </header>

      {error ? (
        <section className="alert-line" role="alert">
          <AlertTriangle aria-hidden />
          <span>{error}</span>
        </section>
      ) : null}

      {settingsOpen ? (
        <section className="settings-panel" aria-label="Configurações">
          <label>
            <span>URL de uso</span>
            <input
              value={settingsDraft.usageUrl}
              onChange={(event) => setSettingsDraft({ ...settingsDraft, usageUrl: event.target.value })}
            />
          </label>
          <div className="settings-grid">
            <label>
              <span>Intervalo</span>
              <input
                type="number"
                min="5"
                max="240"
                value={settingsDraft.refreshIntervalMinutes}
                onChange={(event) =>
                  setSettingsDraft({ ...settingsDraft, refreshIntervalMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.refreshInBackground}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, refreshInBackground: event.target.checked })}
              />
              <span>Segundo plano</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.startWithWindows}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, startWithWindows: event.target.checked })}
              />
              <span>Iniciar com Windows</span>
            </label>
          </div>
          <UpdatePanel
            updateState={updateState}
            pendingAction={pendingAction}
            onCheck={() => callUpdateApi("update-check", () => api.checkForUpdates())}
            onInstall={() => callUpdateApi("update-install", () => api.installUpdate())}
          />
          <div className="settings-actions">
            <button className="text-button" onClick={() => callApi("logs", () => api.openLogsDir())}>
              <FileText aria-hidden />
              Logs
            </button>
            <button className="primary-button" onClick={saveSettings} disabled={pendingAction === "settings"}>
              <Save aria-hidden />
              Salvar
            </button>
          </div>
        </section>
      ) : null}

      <section className="account-list" aria-label="Contas monitoradas">
        {state.accounts.map((account) => (
          <article className={`account-card status-${account.status}`} key={account.id}>
            <div className="account-main">
              <div className="account-title-row">
                {editingLabelId === account.id ? (
                  <form
                    className="label-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void callApi(`label-${account.id}`, () => api.updateLabel(account.id, labelDraft));
                      setEditingLabelId(undefined);
                    }}
                  >
                    <input value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} autoFocus />
                    <IconButton title="Salvar nome" type="submit">
                      <Save />
                    </IconButton>
                    <IconButton title="Cancelar" type="button" onClick={() => setEditingLabelId(undefined)}>
                      <X />
                    </IconButton>
                  </form>
                ) : (
                  <>
                    <div>
                      <h2>{account.label}</h2>
                      <p>{statusText(account)}</p>
                    </div>
                    <IconButton title="Renomear" onClick={() => beginEditLabel(account)}>
                      <Pencil />
                    </IconButton>
                  </>
                )}
              </div>

              <UsageMeter account={account} />
              <UsageWindows account={account} />
              <AccountMeta account={account} />
            </div>

            <div className="account-actions">
              <IconButton
                title="Atualizar conta"
                busy={pendingAction === `refresh-${account.id}` || account.status === "refreshing"}
                onClick={() => callApi(`refresh-${account.id}`, () => api.refreshAccount(account.id))}
              >
                <RefreshCcw />
              </IconButton>
              <IconButton title="Abrir login" onClick={() => callApi(`login-${account.id}`, () => api.openLogin(account.id))}>
                <LogIn />
              </IconButton>
              <button className="mini-button" onClick={() => beginManual(account)}>
                Manual
              </button>
            </div>

            {manualAccountId === account.id ? (
              <form
                className="manual-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveManualUsage();
                }}
              >
                <label>
                  <span>% restante</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualPercent}
                    onChange={(event) => setManualPercent(event.target.value)}
                  />
                </label>
                <label>
                  <span>Reset</span>
                  <input value={manualReset} onChange={(event) => setManualReset(event.target.value)} />
                </label>
                <IconButton title="Salvar uso manual" type="submit">
                  <Save />
                </IconButton>
                <IconButton title="Cancelar" type="button" onClick={() => setManualAccountId(undefined)}>
                  <X />
                </IconButton>
              </form>
            ) : null}
          </article>
        ))}
      </section>

      <footer className="footer-line">
        <ShieldCheck aria-hidden />
        <span>
          v{updateState?.currentVersion ?? "0.1.0"} · Sessões ficam locais por perfil. Senhas e cookies não entram nos logs.
        </span>
      </footer>
    </main>
  );
}

function UpdatePanel({
  updateState,
  pendingAction,
  onCheck,
  onInstall
}: {
  updateState?: UpdateState;
  pendingAction?: PendingAction;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const status = updateState ?? fallbackUpdateState;
  const isBusy = pendingAction === "update-check" || status.status === "checking" || status.status === "downloading";
  const canInstall = status.status === "downloaded";

  return (
    <section className={`update-panel status-${status.status}`} aria-label="Atualizações">
      <div className="update-copy">
        <PackageCheck aria-hidden />
        <div>
          <strong>{updateStatusTitle(status)}</strong>
          <span>{updateStatusDetail(status)}</span>
        </div>
      </div>
      <button
        className={canInstall ? "primary-button" : "text-button"}
        onClick={canInstall ? onInstall : onCheck}
        disabled={isBusy || pendingAction === "update-install"}
      >
        {canInstall ? <Download aria-hidden /> : <RefreshCcw aria-hidden className={isBusy ? "spin" : ""} />}
        {canInstall ? "Instalar" : "Buscar"}
      </button>
    </section>
  );
}

function UsageMeter({ account }: { account: AccountUsage }) {
  const remaining = account.remainingPercent;
  const used = account.usedPercent;

  if (remaining === undefined || used === undefined) {
    return (
      <div className="empty-meter">
        <span>Sem leitura</span>
      </div>
    );
  }

  return (
    <div className="usage-meter">
      <div className="meter-copy">
        <strong>{remaining}%</strong>
        <span>restante</span>
      </div>
      <div className="bar-track" aria-label={`${remaining}% restante`}>
        <div className="bar-fill" style={{ width: `${remaining}%` }} />
      </div>
      <div className="meter-copy right">
        <strong>{used}%</strong>
        <span>usado</span>
      </div>
    </div>
  );
}

function UsageWindows({ account }: { account: AccountUsage }) {
  if (!account.windows?.length) {
    return null;
  }

  return (
    <div className="window-list">
      {account.windows.slice(0, 3).map((window) => (
        <div className="window-row" key={`${window.label}-${window.rawText}`}>
          <span>{window.label}</span>
          <strong>{window.remainingPercent}%</strong>
          <small>{window.resetText ?? "sem reset"}</small>
        </div>
      ))}
    </div>
  );
}

function AccountMeta({ account }: { account: AccountUsage }) {
  return (
    <div className="meta-row">
      <StatusIcon account={account} />
      <span>{account.lastCheckedAt ? formatDate(account.lastCheckedAt) : "Nunca atualizado"}</span>
      {account.resetText ? (
        <>
          <Clock3 aria-hidden />
          <span>{account.resetText}</span>
        </>
      ) : null}
    </div>
  );
}

function StatusIcon({ account }: { account: AccountUsage }) {
  if (account.status === "ok" && !account.stale) {
    return <CheckCircle2 aria-hidden className="ok-icon" />;
  }

  if (account.status === "offline") {
    return <WifiOff aria-hidden className="warn-icon" />;
  }

  return <AlertTriangle aria-hidden className="warn-icon" />;
}

function IconButton({
  title,
  children,
  onClick,
  busy,
  active,
  type = "button"
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  active?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={`icon-button${active ? " active" : ""}`}
      title={title}
      aria-label={title}
      type={type}
      onClick={onClick}
      disabled={busy}
    >
      <span className={busy ? "spin" : ""}>{children}</span>
    </button>
  );
}

function statusText(account: AccountUsage): string {
  if (account.status === "ok" && !account.stale) {
    return "Leitura atual";
  }

  if (account.status === "refreshing") {
    return "Atualizando";
  }

  if (account.errorMessage) {
    return account.errorMessage;
  }

  const labels: Record<AccountUsage["status"], string> = {
    ok: "Leitura antiga",
    needs_login: "Entre no Chrome dedicado, feche a janela e atualize",
    captcha: "Resolva a verificação, feche a janela e atualize",
    offline: "Sem internet",
    parse_error: "Leitura indisponível",
    refreshing: "Atualizando"
  };

  return labels[account.status];
}

function updateStatusTitle(state: UpdateState): string {
  const labels: Record<UpdateState["status"], string> = {
    idle: "Atualizações",
    checking: "Buscando atualização",
    available: "Atualização encontrada",
    downloading: "Baixando atualização",
    downloaded: "Atualização pronta",
    "not-available": "App atualizado",
    disabled: "Update em release",
    error: "Falha ao buscar update"
  };

  return labels[state.status];
}

function updateStatusDetail(state: UpdateState): string {
  if (state.status === "downloaded") {
    return `Versão ${state.latestVersion ?? "nova"} baixada.`;
  }

  if (state.status === "available") {
    return `Versão ${state.latestVersion ?? "nova"} disponível.`;
  }

  if (state.status === "downloading") {
    return `${state.progressPercent ?? 0}% baixado.`;
  }

  if (state.status === "not-available") {
    return `Versão ${state.currentVersion}.`;
  }

  if (state.status === "error" || state.status === "disabled") {
    return state.errorMessage ?? `Versão ${state.currentVersion}.`;
  }

  return `Versão ${state.currentVersion}.`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isAppState(value: unknown): value is AppState {
  return Boolean(value && typeof value === "object" && "accounts" in value && "settings" in value);
}
