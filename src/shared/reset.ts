export function formatReset(resetsAt: number | undefined, now: number): string | undefined {
  if (!resetsAt) {
    return undefined;
  }

  const diffMs = resetsAt * 1000 - now;
  if (diffMs <= 0) {
    return "renovando";
  }

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return `em ${minutes} min`;
  }

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) {
    return `em ${hours} h`;
  }

  return `em ${Math.round(diffMs / 86_400_000)} d`;
}
