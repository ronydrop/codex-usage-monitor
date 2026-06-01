import { describe, expect, it } from "vitest";
import { AccountRefreshLock } from "../main/refresh-lock";

describe("AccountRefreshLock", () => {
  it("shares the in-flight refresh for the same account", async () => {
    const lock = new AccountRefreshLock();
    let calls = 0;

    const first = lock.run("account-1", async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "fresh";
    });
    const second = lock.run("account-1", async () => {
      calls += 1;
      return "duplicate";
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["fresh", "fresh"]);
    expect(calls).toBe(1);
  });

  it("allows different accounts to refresh independently", async () => {
    const lock = new AccountRefreshLock();

    await expect(
      Promise.all([
        lock.run("account-1", async () => "a"),
        lock.run("account-2", async () => "b")
      ])
    ).resolves.toEqual(["a", "b"]);
  });
});
