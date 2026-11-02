/** Start of a display range in UTC. YTD is calendar-based, not a fixed day count. */
export function rangeStart(range: string, now = new Date()): Date {
  if (range === 'YTD') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days: Record<string, number> = { '1D': 1, '5D': 5, '1M': 31, '6M': 183, '1Y': 366, '5Y': 1827, MAX: 7300 };
  return new Date(now.getTime() - (days[range] ?? 183) * 86400000);
}
