import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../main/store";
import type { AccountUsage } from "../shared/types";

let tempDirs: string[] = [];

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "codex-usage-store-"));
  tempDirs.push(dir);
  return { dir, store: new AccountStore(dir) };
}

function account(patch: Partial<AccountUsage> & { id: string }): AccountUsage {
  return { label: patch.id, status: "ok", stale: false, ...patch };
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("AccountStore", () => {
  it("starts with no accounts and default settings", async () => {
    const { store } = await makeStore();
    const state = await store.loadState();

    expect(state.accounts).toHaveLength(0);
    expect(state.settings).toMatchObject({
      codexHome: "",
      refreshIntervalMinutes: 30,
      refreshInBackground: false,
      startWithWindows: false
    });
  });

  it("upserts a discovered account and merges later readings", async () => {
    const { store } = await makeStore();

    await store.upsertAccount(
      account({ id: "acct-1", label: "rony@aprovei.ai", email: "rony@aprovei.ai", remainingPercent: 80 })
    );
    await store.upsertAccount(account({ id: "acct-1", label: "rony@aprovei.ai", remainingPercent: 55, usedPercent: 45 }));

    const accounts = await store.load();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: "acct-1", remainingPercent: 55, usedPercent: 45 });
  });

  it("preserves a user-renamed label across upserts", async () => {
    const { store } = await makeStore();

    await store.upsertAccount(account({ id: "acct-1", label: "rony@aprovei.ai" }));
    await store.updateAccount("acct-1", { label: "Conta principal" });
    await store.upsertAccount(account({ id: "acct-1", label: "rony@aprovei.ai", remainingPercent: 20 }));

    const accounts = await store.load();
    expect(accounts[0]).toMatchObject({ label: "Conta principal", remainingPercent: 20 });
  });

  it("removes an account from persisted state", async () => {
    const { store } = await makeStore();

    await store.upsertAccount(account({ id: "acct-1", label: "Conta principal" }));
    await store.upsertAccount(account({ id: "acct-2", label: "Conta secundaria" }));

    const accounts = await store.removeAccount("acct-1");

    expect(accounts.map((item) => item.id)).toEqual(["acct-2"]);
    expect((await store.load()).map((item) => item.id)).toEqual(["acct-2"]);
  });

  it("serializes concurrent upserts without losing accounts", async () => {
    const { store } = await makeStore();

    await Promise.all([
      store.upsertAccount(account({ id: "a", label: "a" })),
      store.upsertAccount(account({ id: "b", label: "b" })),
      store.upsertAccount(account({ id: "c", label: "c" }))
    ]);

    const accounts = await store.load();
    expect(new Set(accounts.map((item) => item.id))).toEqual(new Set(["a", "b", "c"]));
  });

  it("downgrades persisted refreshing accounts to no_data on reload", async () => {
    const { dir, store } = await makeStore();
    await writeFile(
      join(dir, "state.json"),
      JSON.stringify({
        accounts: [{ id: "acct-1", label: "Conta presa", status: "refreshing", stale: false, remainingPercent: 42 }],
        settings: { codexHome: "", refreshIntervalMinutes: 30, refreshInBackground: false, startWithWindows: false }
      }),
      "utf8"
    );

    const state = await store.loadState();

    expect(state.accounts[0]).toMatchObject({
      label: "Conta presa",
      status: "no_data",
      stale: true,
      remainingPercent: 42
    });
  });
});
