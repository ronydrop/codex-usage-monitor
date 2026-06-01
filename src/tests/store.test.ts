import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../main/store";

let tempDirs: string[] = [];

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "codex-usage-store-"));
  tempDirs.push(dir);
  return { dir, store: new AccountStore(dir) };
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("AccountStore", () => {
  it("creates exactly three default accounts with isolated profile paths", async () => {
    const { dir, store } = await makeStore();
    const accounts = await store.load();

    expect(accounts).toHaveLength(3);
    expect(accounts.map((account) => account.label)).toEqual(["Conta A", "Conta B", "Conta C"]);
    expect(new Set(accounts.map((account) => account.profilePath)).size).toBe(3);
    expect(accounts[0].profilePath).toBe(join(dir, "profiles", "account-1"));
  });

  it("persists labels and manual usage without losing stale state", async () => {
    const { store } = await makeStore();

    await store.updateAccount("account-1", {
      label: "Codex Pro",
      status: "ok",
      remainingPercent: 68,
      usedPercent: 32,
      resetText: "07:08",
      stale: false
    });

    const reloaded = await store.load();

    expect(reloaded[0]).toMatchObject({
      id: "account-1",
      label: "Codex Pro",
      status: "ok",
      remainingPercent: 68,
      usedPercent: 32,
      resetText: "07:08",
      stale: false
    });
  });
});
