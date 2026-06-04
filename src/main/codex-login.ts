import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { readActiveAccount } from "./codex-usage";
import type { CodexActiveAccount } from "./codex-usage";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const AUTH_POLL_INTERVAL_MS = 2_000;
const AUTH_POLL_MAX = LOGIN_TIMEOUT_MS / AUTH_POLL_INTERVAL_MS;

async function resolveCodexBin(): Promise<{ cmd: string; shell: boolean }> {
  if (process.platform === "win32") {
    const npmBin = join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "npm",
      "codex.cmd"
    );
    try {
      await access(npmBin);
      return { cmd: npmBin, shell: true };
    } catch {
      // fallback
    }

    const fallback = join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js"
    );
    return { cmd: `node "${fallback}"`, shell: true };
  }

  return { cmd: "codex", shell: false };
}

export async function runLogin(
  codexHome: string,
  onReady: () => void
): Promise<CodexActiveAccount> {
  const { cmd, shell } = await resolveCodexBin();

  const child = spawn(cmd, ["login"], {
    shell,
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: "ignore",
  });

  onReady();

  return new Promise<CodexActiveAccount>((resolve, reject) => {
    let polls = 0;

    const poll = setInterval(async () => {
      polls++;
      const account = await readActiveAccount(codexHome);
      if (account.accountId) {
        clearInterval(poll);
        child.kill();
        resolve(account);
        return;
      }

      if (polls >= AUTH_POLL_MAX) {
        clearInterval(poll);
        child.kill();
        reject(new Error("Tempo esgotado aguardando login. Tente novamente."));
      }
    }, AUTH_POLL_INTERVAL_MS);

    child.on("error", (err) => {
      clearInterval(poll);
      reject(err);
    });
  });
}
