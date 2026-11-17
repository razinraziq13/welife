const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Formats a byte count for display, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number, locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted} ${UNITS[unit] ?? 'B'}`;
}
