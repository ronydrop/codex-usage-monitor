import type { UsageParseResult, UsageWindow } from "../shared/types";

const PERCENT_PATTERN = /(\d{1,3})\s*%/;
const WINDOW_LABEL_PATTERN =
  /^(?:\d+\s*(?:h|hr|hrs|hour|hours|min|m)|semanal|weekly|di[aá]rio|daily|mensal|monthly)$/i;

export function parseUsageText(input: string): UsageParseResult | null {
  const lines = normalizeLines(input);
  if (lines.length === 0) {
    return null;
  }

  const globalMode = detectMode(lines.join(" "));
  const windows: UsageWindow[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(PERCENT_PATTERN);

    if (!match) {
      continue;
    }

    const percent = clampPercent(Number.parseInt(match[1], 10));
    const contextMode = detectMode(lines.slice(Math.max(0, index - 3), index + 2).join(" ")) ?? globalMode;
    const isUsed = contextMode === "used";
    const usedPercent = isUsed ? percent : 100 - percent;
    const remainingPercent = isUsed ? 100 - percent : percent;
    const resetText = extractResetText(line, index, lines);

    windows.push({
      label: findWindowLabel(lines, index),
      remainingPercent,
      usedPercent,
      resetText,
      rawText: line
    });
  }

  if (windows.length === 0) {
    return null;
  }

  const primary = windows[0];

  return {
    remainingPercent: primary.remainingPercent,
    usedPercent: primary.usedPercent,
    resetText: primary.resetText,
    windows
  };
}

function normalizeLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function detectMode(text: string): "remaining" | "used" | undefined {
  const normalized = text.toLocaleLowerCase();

  if (/\b(restante|remaining|left|dispon[ií]vel|available)\b/.test(normalized)) {
    return "remaining";
  }

  if (/\b(usado|used|consumido|spent|usage used)\b/.test(normalized)) {
    return "used";
  }

  return undefined;
}

function extractResetText(line: string, index: number, lines: string[]): string | undefined {
  const textAfterPercent = line.replace(/^.*?\d{1,3}\s*%/, "").trim();
  if (textAfterPercent) {
    return textAfterPercent;
  }

  const nextLine = lines[index + 1];
  if (nextLine && !PERCENT_PATTERN.test(nextLine) && !WINDOW_LABEL_PATTERN.test(nextLine)) {
    return nextLine;
  }

  return undefined;
}

function findWindowLabel(lines: string[], percentLineIndex: number): string {
  for (let index = percentLineIndex - 1; index >= Math.max(0, percentLineIndex - 3); index -= 1) {
    const candidate = lines[index];
    if (WINDOW_LABEL_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  return "Uso";
}

