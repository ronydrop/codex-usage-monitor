import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../main/store";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("default settings", () => {
  it("does not default protected usage refresh to headless background mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-settings-store-"));
    tempDirs.push(dir);

    const state = await new AccountStore(dir).loadState();

    expect(state.settings.refreshInBackground).toBe(false);
  });
});
