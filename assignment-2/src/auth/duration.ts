const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses "15m", "7d", "30s" etc. into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${value}" - expected a number followed by s, m, h or d`,
    );
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
