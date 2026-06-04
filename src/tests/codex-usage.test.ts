import { describe, expect, it } from "vitest";
import {
  AUTH_SKEW_MS,
  buildWindows,
  decodeJwtPayload,
  formatReset,
  isSnapshotFresh,
  labelForWindow,
  mapRateLimits,
  parseActiveAccount,
  parseRateLimitLine
} from "../main/codex-usage";

const NOW = Date.parse("2026-06-03T21:00:00.000Z");

function makeIdToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.sig`;
}

describe("parseRateLimitLine", () => {
  it("extracts primary and secondary windows from a token_count event", () => {
    const line = JSON.stringify({
      timestamp: "2026-06-03T20:56:25.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          primary: { used_percent: 20, window_minutes: 300, resets_at: 1780546415 },
          secondary: { used_percent: 100, window_minutes: 10080, resets_at: 1780895284 },
          plan_type: "pro"
        }
      }
    });

    const snapshot = parseRateLimitLine(line);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.capturedAt).toBe(Date.parse("2026-06-03T20:56:25.000Z"));
    expect(snapshot?.rateLimits.primary).toEqual({ usedPercent: 20, windowMinutes: 300, resetsAt: 1780546415 });
    expect(snapshot?.rateLimits.secondary?.usedPercent).toBe(100);
    expect(snapshot?.rateLimits.planType).toBe("pro");
  });

  it("ignores lines without rate_limits", () => {
    expect(parseRateLimitLine(JSON.stringify({ type: "message", payload: {} }))).toBeNull();
    expect(parseRateLimitLine("")).toBeNull();
    expect(parseRateLimitLine("not json")).toBeNull();
  });
});

describe("parseActiveAccount", () => {
  it("reads account id, email and plan from auth.json", () => {
    const raw = JSON.stringify({
      tokens: {
        account_id: "acct-123",
        id_token: makeIdToken({
          email: "rony@aprovei.ai",
          "https://api.openai.com/auth": { chatgpt_plan_type: "pro" }
        })
      }
    });

    expect(parseActiveAccount(raw)).toEqual({
      accountId: "acct-123",
      email: "rony@aprovei.ai",
      planType: "pro"
    });
  });

  it("returns empty object for invalid json", () => {
    expect(parseActiveAccount("broken")).toEqual({});
  });
});

describe("decodeJwtPayload", () => {
  it("decodes base64url payload", () => {
    const token = makeIdToken({ email: "a@b.com" });
    expect(decodeJwtPayload(token)).toEqual({ email: "a@b.com" });
  });
});

describe("labelForWindow", () => {
  it("maps known windows to friendly labels", () => {
    expect(labelForWindow(300)).toBe("5 h");
    expect(labelForWindow(10080)).toBe("Semanal");
    expect(labelForWindow(1440)).toBe("Diário");
    expect(labelForWindow(90)).toBe("90 min");
  });
});

describe("formatReset", () => {
  it("formats remaining time relative to now", () => {
    expect(formatReset(undefined, NOW)).toBeUndefined();
    expect(formatReset(Math.floor(NOW / 1000) - 10, NOW)).toBe("renovando");
    expect(formatReset(Math.floor(NOW / 1000) + 30 * 60, NOW)).toBe("em 30 min");
    expect(formatReset(Math.floor(NOW / 1000) + 3 * 3600, NOW)).toBe("em 3 h");
    expect(formatReset(Math.floor(NOW / 1000) + 2 * 86400, NOW)).toBe("em 2 d");
  });
});

describe("buildWindows", () => {
  it("converts rate limits into usage windows with remaining percent and absolute reset", () => {
    const primaryReset = Math.floor(NOW / 1000) + 3600;
    const rateLimits = mapRateLimits({
      primary: { used_percent: 20, window_minutes: 300, resets_at: primaryReset },
      secondary: { used_percent: 100, window_minutes: 10080, resets_at: Math.floor(NOW / 1000) + 2 * 86400 }
    });

    const windows = buildWindows(rateLimits, NOW);

    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({
      label: "5 h",
      remainingPercent: 80,
      usedPercent: 20,
      resetText: "em 1 h",
      resetsAt: primaryReset
    });
    expect(windows[1]).toMatchObject({ label: "Semanal", remainingPercent: 0, usedPercent: 100, resetText: "em 2 d" });
  });
});

describe("isSnapshotFresh", () => {
  it("treats a missing auth timestamp as fresh", () => {
    expect(isSnapshotFresh(1000, undefined)).toBe(true);
  });

  it("accepts snapshots captured at or after login (minus skew)", () => {
    const authAt = 1_000_000;
    expect(isSnapshotFresh(authAt, authAt)).toBe(true);
    expect(isSnapshotFresh(authAt - AUTH_SKEW_MS, authAt)).toBe(true);
    expect(isSnapshotFresh(authAt + 60_000, authAt)).toBe(true);
  });

  it("rejects snapshots from before the current login (previous account)", () => {
    const authAt = 1_000_000;
    expect(isSnapshotFresh(authAt - AUTH_SKEW_MS - 1, authAt)).toBe(false);
  });
});
