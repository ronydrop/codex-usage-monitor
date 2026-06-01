import { describe, expect, it } from "vitest";
import type { AccountUsage, AppSettings } from "../shared/types";
import type { AppLogger } from "../main/logger";
import type { SystemChromeProvider } from "../main/browser-provider";
import { UsageCollector } from "../main/collector";

class FakePage {
  public currentUrl: string;

  constructor(
    private readonly bodyText: string,
    url = "https://chatgpt.com/"
  ) {
    this.currentUrl = url;
  }

  locator() {
    return {
      innerText: async () => this.bodyText
    };
  }

  url() {
    return this.currentUrl;
  }

  async goto(url: string) {
    this.currentUrl = url;
  }

  async waitForLoadState() {
    return undefined;
  }

  async bringToFront() {
    return undefined;
  }
}

class FakeChromeProvider {
  public readonly openCalls: Array<{ accountId: string; profilePath: string; url: string }> = [];
  public readonly closeCalls: string[] = [];

  constructor(private readonly page: FakePage) {}

  async openPage(accountId: string, profilePath: string, url: string) {
    this.openCalls.push({ accountId, profilePath, url });
    this.page.currentUrl = url;
    return { page: this.page };
  }

  async close(accountId: string) {
    this.closeCalls.push(accountId);
  }

  async closeAll() {
    this.closeCalls.push("all");
  }
}

const logger = {
  info: async () => undefined,
  warn: async () => undefined,
  error: async () => undefined
} as unknown as AppLogger;

const account: AccountUsage = {
  id: "account-1",
  label: "Conta A",
  profilePath: "C:\\profiles\\account-1",
  status: "ok",
  stale: true
};

const settings: AppSettings = {
  usageUrl: "https://chatgpt.com/codex/settings/usage",
  refreshIntervalMinutes: 30,
  refreshInBackground: true,
  startWithWindows: false
};

describe("UsageCollector with SystemChromeProvider", () => {
  it("opens login in the account Chrome profile without going directly to the usage URL", async () => {
    const provider = new FakeChromeProvider(new FakePage("Sign in"));
    const collector = new UsageCollector(logger, provider as unknown as SystemChromeProvider);

    const result = await collector.openLoginWindow(account, settings);

    expect(provider.openCalls).toEqual([
      {
        accountId: "account-1",
        profilePath: "C:\\profiles\\account-1",
        url: "https://chatgpt.com/"
      }
    ]);
    expect(result).toMatchObject({
      status: "needs_login",
      stale: true,
      errorMessage: "Chrome dedicado aberto. Entre na conta, resolva a verificação se aparecer e clique em Atualizar."
    });
  });

  it("keeps Chrome open when Cloudflare/captcha is detected during collection", async () => {
    const provider = new FakeChromeProvider(new FakePage("Cloudflare verify you are human"));
    const collector = new UsageCollector(logger, provider as unknown as SystemChromeProvider);

    const result = await collector.collect(account, settings);

    expect(result).toMatchObject({
      status: "captcha",
      stale: true,
      errorMessage: "Resolva a verificação no Chrome aberto e clique em Atualizar."
    });
    expect(provider.closeCalls).toEqual([]);
  });
});
