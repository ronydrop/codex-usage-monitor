const EMAIL_PATTERN = /\b([A-Z0-9._%+-])([A-Z0-9._%+-]*)(@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const BEARER_PATTERN = /(Authorization:\s*Bearer\s+)[^\s]+/gi;
const COOKIE_PATTERN = /(Cookie:\s*)[^\n\r]+/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:OPENAI_API_KEY|api[_-]?key|access[_-]?token|refresh[_-]?token|session|cookie)\s*=\s*)[^\s;]+/gi;
const OPENAI_SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{10,}\b/g;

export function redactSensitiveText(input: string): string {
  return input
    .replace(EMAIL_PATTERN, (_match, first: string, _rest: string, domain: string) => `${first}***${domain}`)
    .replace(BEARER_PATTERN, "$1[REDACTED]")
    .replace(COOKIE_PATTERN, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1[REDACTED]")
    .replace(OPENAI_SECRET_PATTERN, "[REDACTED]");
}

