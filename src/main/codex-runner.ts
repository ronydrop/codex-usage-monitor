import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const EXEC_TIMEOUT_MS = 45_000;

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
      // fallback: procurar node_modules global
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

export async function triggerExec(codexHome: string): Promise<void> {
  const { cmd, shell } = await resolveCodexBin();

  const args = [
    "exec",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "--ignore-user-config",
    "ping",
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      shell,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: "ignore",
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, EXEC_TIMEOUT_MS);

    child.on("close", () => {
      clearTimeout(timer);
      resolve();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
