import { describe, expect, it } from "vitest";
import { parseUsageText } from "../main/usage-parser";

describe("parseUsageText", () => {
  it("extracts Portuguese remaining usage windows from Codex usage text", () => {
    const result = parseUsageText(`
      Uso restante
      5 h
      68% 07:08
      Semanal
      93% 8 de jun.
    `);

    expect(result).toEqual({
      remainingPercent: 68,
      usedPercent: 32,
      resetText: "07:08",
      windows: [
        {
          label: "5 h",
          remainingPercent: 68,
          usedPercent: 32,
          resetText: "07:08",
          rawText: "68% 07:08"
        },
        {
          label: "Semanal",
          remainingPercent: 93,
          usedPercent: 7,
          resetText: "8 de jun.",
          rawText: "93% 8 de jun."
        }
      ]
    });
  });

  it("extracts English usage windows and computes remaining from used context", () => {
    const result = parseUsageText(`
      Usage used
      5 hours
      42% resets 09:30
      Weekly
      76% resets Jun 8
    `);

    expect(result?.windows).toEqual([
      {
        label: "5 hours",
        remainingPercent: 58,
        usedPercent: 42,
        resetText: "resets 09:30",
        rawText: "42% resets 09:30"
      },
      {
        label: "Weekly",
        remainingPercent: 24,
        usedPercent: 76,
        resetText: "resets Jun 8",
        rawText: "76% resets Jun 8"
      }
    ]);
  });

  it("returns null when the page text has no percentage", () => {
    expect(parseUsageText("Sign in to continue")).toBeNull();
  });

  it("clamps invalid percentages instead of returning impossible values", () => {
    const result = parseUsageText("Uso restante\n5 h\n140% 07:08");

    expect(result?.remainingPercent).toBe(100);
    expect(result?.usedPercent).toBe(0);
  });
});
