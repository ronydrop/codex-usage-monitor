import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("renderer icon buttons", () => {
  const styles = readFileSync(join(process.cwd(), "src/renderer/src/styles.css"), "utf8");

  it("keeps the busy refresh icon rotating around a centered square box", () => {
    expect(styles).toMatch(/\.icon-button\s*>\s*span\s*{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(/\.icon-button\s*>\s*span\s*{[^}]*width:\s*18px;/s);
    expect(styles).toMatch(/\.icon-button\s*>\s*span\s*{[^}]*height:\s*18px;/s);
    expect(styles).toMatch(/\.spin\s*{[^}]*transform-origin:\s*center;/s);
  });
});
