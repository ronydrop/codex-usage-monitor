import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AccountUsage, AppSettings, AppState, IpcResult, UpdateState } from "../../shared/types";
import { formatReset } from "../../shared/reset";

type PendingAction = string | undefined;

const fallbackState: AppState = {
  settings: {
    codexHome: "",
    refreshIntervalMinutes: 30,
    refreshInBackground: false,
    startWithWindows: false
  },
  accounts: [
    {
      id: "account-1",
      label: "rony@aprovei.ai",
      email: "rony@aprovei.ai",
      planType: "pro",
      status: "ok",
      remainingPercent: 80,
      usedPercent: 20,
      resetText: "em 3 h",
      stale: false,
      lastCheckedAt: new Date().toISOString(),
      windows: [
        { label: "5 h", remainingPercent: 80, usedPercent: 20, resetText: "em 3 h", rawText: "20% usado · em 3 h" },
        { label: "Semanal", remainingPercent: 0, usedPercent: 100, resetText: "em 2 d", rawText: "100% usado · em 2 d" }
      ]
    },
    {
      id: "account-2",
      label: "sac@aprovei.ai",
      email: "sac@aprovei.ai",
      status: "no_data",
      stale: true,
      errorMessage: "Sem leitura do Codex ainda. Use o Codex nesta conta para gerar uma leitura."
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
  addAccount: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  removeAccount: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
  updateLabel: async (): Promise<IpcResult<AppState>> => ({ ok: true, data: fallbackState }),
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | undefined>();
  const [updateState, setUpdateState] = useState<UpdateState | undefined>();
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(() => new Set());
  const [addingAccount, setAddingAccount] = useState(false);

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

  function toggleAccountExpanded(accountId: string) {
    setExpandedAccountIds((current) => {
      const next = new Set(current);
      if (current.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
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
            title="Adicionar conta"
            busy={addingAccount}
            onClick={async () => {
              setAddingAccount(true);
              setError(undefined);
              const result = await api.addAccount();
              setAddingAccount(false);
              if (!result.ok) {
                setError(result.error);
              } else if (isAppState(result.data)) {
                setState(result.data);
                setSettingsDraft(result.data.settings);
              }
            }}
          >
            <Plus />
          </IconButton>
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
            <span>Pasta do Codex (.codex)</span>
            <input
              value={settingsDraft.codexHome}
              placeholder="Padrão: ~/.codex"
              onChange={(event) => setSettingsDraft({ ...settingsDraft, codexHome: event.target.value })}
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
        {addingAccount ? (
          <div className="login-hint">
            <RefreshCcw className="spin" aria-hidden />
            <span>Aguardando login no browser... Complete o OAuth e a conta será adicionada.</span>
          </div>
        ) : null}
        {state.accounts.length === 0 && !addingAccount ? (
          <p className="empty-hint">
            Nenhuma conta ainda. Clique em + para adicionar ou abra o Codex e clique em atualizar.
          </p>
        ) : null}
        {state.accounts.map((account) => {
          const expanded = expandedAccountIds.has(account.id);
          const detailsId = `account-details-${account.id}`;

          return (
            <article
              className={`account-card status-${account.status}${expanded ? " expanded" : " collapsed"}`}
              key={account.id}
            >
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
                      <div className="account-heading">
                        <button
                          className="account-collapse-button"
                          type="button"
                          title={expanded ? "Recolher conta" : "Expandir conta"}
                          aria-expanded={expanded}
                          aria-controls={detailsId}
                          onClick={() => toggleAccountExpanded(account.id)}
                        >
                          <ChevronDown className={expanded ? "collapse-icon expanded" : "collapse-icon"} />
                        </button>
                        <div>
                          <h2>{account.label}</h2>
                          <p>{statusText(account)}</p>
                        </div>
                      </div>
                      <IconButton title="Renomear" onClick={() => beginEditLabel(account)}>
                        <Pencil />
                      </IconButton>
                      {account.codexHome ? (
                        <IconButton
                          title="Remover conta"
                          onClick={() => {
                            if (confirm(`Remover conta ${account.email ?? account.label}?`)) {
                              void callApi(`remove-${account.id}`, () => api.removeAccount(account.id));
                            }
                          }}
                        >
                          <Trash2 />
                        </IconButton>
                      ) : null}
                    </>
                  )}
                </div>

                {expanded ? (
                  <div className="account-details" id={detailsId}>
                    <UsageMeter account={account} />
                    <UsageWindows account={account} />
                    <AccountMeta account={account} />

                    <div className="account-actions">
                      <IconButton
                        title="Atualizar conta"
                        busy={pendingAction === `refresh-${account.id}` || account.status === "refreshing"}
                        onClick={() => callApi(`refresh-${account.id}`, () => api.refreshAccount(account.id))}
                      >
                        <RefreshCcw />
                      </IconButton>
                    </div>
                  </div>
                ) : (
                  <CompactAccountSummary account={account} />
                )}
              </div>
            </article>
          );
        })}
      </section>

      <footer className="footer-line">
        <ShieldCheck aria-hidden />
        <span>
          v{updateState?.currentVersion ?? "0.1.0"} · Lê o uso direto dos logs locais do Codex. Sem navegador, sem senha.
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

function CompactAccountSummary({ account }: { account: AccountUsage }) {
  const remaining = account.remainingPercent;

  if (remaining === undefined) {
    return (
      <div className="account-summary">
        <StatusIcon account={account} />
        <span className="summary-status">{statusText(account)}</span>
        <span className="summary-empty">Sem leitura</span>
      </div>
    );
  }

  return (
    <div className="account-summary">
      <StatusIcon account={account} />
      <span className="summary-status">{statusText(account)}</span>
      <div className="compact-meter" aria-label={`${remaining}% restante`}>
        <div className="compact-meter-fill" style={{ width: `${remaining}%` }} />
      </div>
      <strong>{remaining}%</strong>
      <span>restante</span>
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
          <small>{resetLabel(window.resetsAt, window.resetText) ?? "sem reset"}</small>
        </div>
      ))}
    </div>
  );
}

function AccountMeta({ account }: { account: AccountUsage }) {
  const reset = resetLabel(account.resetsAt, account.resetText);

  return (
    <div className="meta-row">
      <StatusIcon account={account} />
      <span>{account.lastCheckedAt ? formatDate(account.lastCheckedAt) : "Nunca atualizado"}</span>
      {reset ? (
        <>
          <Clock3 aria-hidden />
          <span>{reset}</span>
        </>
      ) : null}
    </div>
  );
}

function resetLabel(resetsAt?: number, fallback?: string): string | undefined {
  if (resetsAt) {
    return formatReset(resetsAt, Date.now());
  }

  return fallback;
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
    no_data: "Sem leitura ainda",
    offline: "Sem internet",
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
