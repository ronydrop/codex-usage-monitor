import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSystemChromeArgs,
  findSystemChromeExecutable,
  getChromeProfilePath,
  parseDevToolsActivePort
} from "../main/browser-provider";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("browser-provider helpers", () => {
  it("uses a dedicated Chrome profile inside the account profile path", () => {
    expect(getChromeProfilePath("C:\\app\\profiles\\account-1")).toBe("C:\\app\\profiles\\account-1\\chrome-profile");
  });

  it("parses Chrome DevToolsActivePort content into a local CDP endpoint", () => {
    expect(parseDevToolsActivePort("55321\n/devtools/browser/abc\n")).toEqual({
      port: 55321,
      browserPath: "/devtools/browser/abc",
      endpoint: "http://127.0.0.1:55321"
    });
  });

  it("builds Chrome args with a dedicated user-data-dir and no automation bypass flags", () => {
    const args = buildSystemChromeArgs({
      profilePath: "C:\\profiles\\account-1\\chrome-profile",
      url: "https://chatgpt.com/"
    });

    expect(args).toContain("--remote-debugging-port=0");
    expect(args).toContain("--user-data-dir=C:\\profiles\\account-1\\chrome-profile");
    expect(args).toContain("https://chatgpt.com/");
    expect(args.join(" ")).not.toMatch(/stealth|disable-blink-features|AutomationControlled|captcha/i);
  });

  it("finds the first existing Chrome executable from candidate paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-chrome-provider-"));
    tempDirs.push(dir);
    const missing = join(dir, "missing.exe");
    const chrome = join(dir, "chrome.exe");
    await mkdir(dir, { recursive: true });
    await writeFile(chrome, "", "utf8");

    await expect(findSystemChromeExecutable([missing, chrome])).resolves.toBe(chrome);
  });
});
