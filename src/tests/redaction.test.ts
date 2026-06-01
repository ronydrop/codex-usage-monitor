import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../main/redaction";

describe("redactSensitiveText", () => {
  it("redacts emails, bearer tokens, cookies, and OpenAI-style secrets", () => {
    const text = [
      "user john.doe@example.com",
      "Authorization: Bearer abc.def.ghi",
      "Cookie: session=super-secret; cf_clearance=clearance-token",
      "OPENAI_API_KEY=sk-proj-1234567890abcdef"
    ].join("\n");

    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("j***@example.com");
    expect(redacted).toContain("Authorization: Bearer [REDACTED]");
    expect(redacted).toContain("Cookie: [REDACTED]");
    expect(redacted).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(redacted).not.toContain("super-secret");
    expect(redacted).not.toContain("sk-proj-1234567890abcdef");
  });
});
