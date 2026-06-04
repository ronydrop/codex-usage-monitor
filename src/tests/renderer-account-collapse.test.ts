import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("renderer account cards", () => {
  const app = readFileSync(join(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
  const preload = readFileSync(join(process.cwd(), "src/main/preload.ts"), "utf8");
  const styles = readFileSync(join(process.cwd(), "src/renderer/src/styles.css"), "utf8");

  it("keeps accounts collapsible while preserving rename controls", () => {
    expect(app).toContain("expandedAccountIds");
    expect(app).toContain("toggleAccountExpanded");
    expect(app).toContain("aria-expanded");
    expect(app).toContain("beginEditLabel(account)");
  });

  it("exposes a delete action for monitored accounts", () => {
    expect(preload).toContain("deleteAccount");
    expect(preload).toContain('ipcRenderer.invoke("account:delete"');
    expect(app).toContain("Trash2");
    expect(app).toContain("confirmDeleteAccount(account)");
    expect(app).toContain("api.deleteAccount(account.id)");
  });

  it("has compact account summary styles for collapsed cards", () => {
    expect(styles).toMatch(/\.account-card\.collapsed/s);
    expect(styles).toMatch(/\.account-summary/s);
    expect(styles).toMatch(/\.compact-meter/s);
  });
});
