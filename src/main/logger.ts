import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "./redaction";

export class AppLogger {
  private readonly logPath: string;

  constructor(baseDir: string) {
    this.logPath = join(baseDir, "logs", "app.log");
  }

  async info(message: string, meta?: unknown): Promise<void> {
    await this.write("info", message, meta);
  }

  async warn(message: string, meta?: unknown): Promise<void> {
    await this.write("warn", message, meta);
  }

  async error(message: string, meta?: unknown): Promise<void> {
    await this.write("error", message, meta);
  }

  private async write(level: "info" | "warn" | "error", message: string, meta?: unknown): Promise<void> {
    const payload = meta === undefined ? "" : ` ${safeStringify(meta)}`;
    const line = redactSensitiveText(`${new Date().toISOString()} ${level.toUpperCase()} ${message}${payload}\n`);

    await mkdir(dirname(this.logPath), { recursive: true });
    await appendFile(this.logPath, line, "utf8");
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}
