import type { AccountUsage, AppSettings } from "../shared/types";
import type { AppLogger } from "./logger";
import {
  buildWindows,
  findLatestSnapshot,
  isSnapshotFresh,
  readActiveAccount,
  readAuthModifiedAt,
  type CodexActiveAccount
} from "./codex-usage";
import { resolveCodexHome } from "./store";

const NO_DATA_MESSAGE = "Sem leitura do Codex ainda. Use o Codex nesta conta para gerar uma leitura.";
const JUST_SWITCHED_MESSAGE = "Conta recém-trocada. Use o Codex nesta conta para ler o uso atualizado.";

export type ActiveUsage = {
  account: CodexActiveAccount;
  patch: Partial<AccountUsage> | null;
};

export class UsageCollector {
  constructor(private readonly logger: AppLogger) {}

  async readActiveUsage(settings: AppSettings, now = Date.now()): Promise<ActiveUsage> {
    const codexHome = resolveCodexHome(settings);
    const account = await readActiveAccount(codexHome);

    if (!account.accountId) {
      await this.logger.warn("Codex sem conta ativa em auth.json", { codexHome });
      return { account, patch: null };
    }

    const [snapshot, authModifiedAt] = await Promise.all([
      findLatestSnapshot(codexHome),
      readAuthModifiedAt(codexHome)
    ]);

    const fresh = snapshot !== null && isSnapshotFresh(snapshot.capturedAt, authModifiedAt);

    if (!snapshot || !fresh) {
      return {
        account,
        patch: {
          status: "no_data",
          stale: true,
          errorMessage: snapshot ? JUST_SWITCHED_MESSAGE : NO_DATA_MESSAGE
        }
      };
    }

    const windows = buildWindows(snapshot.rateLimits, now);
    const primary = windows[0];

    return {
      account,
      patch: {
        status: "ok",
        stale: false,
        planType: account.planType ?? snapshot.rateLimits.planType,
        remainingPercent: primary?.remainingPercent,
        usedPercent: primary?.usedPercent,
        resetText: primary?.resetText,
        resetsAt: primary?.resetsAt,
        windows,
        lastCheckedAt: new Date(snapshot.capturedAt).toISOString(),
        errorMessage: undefined
      }
    };
  }
}
