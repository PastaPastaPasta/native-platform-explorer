export function formatDate(input: Date | number | string | bigint | undefined | null): string {
  if (input === null || input === undefined) return '—';
  const d =
    input instanceof Date
      ? input
      : typeof input === 'bigint'
        ? new Date(Number(input))
        : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface TimeDelta {
  value: number;
  unit: 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';
  past: boolean;
  short: string; // e.g. "3m ago", "in 2h"
  full: string; // e.g. "3 minutes ago"
}

const RTF = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

export function getTimeDelta(when: Date | number | string | bigint | null | undefined): TimeDelta | null {
  if (when === null || when === undefined) return null;
  const target =
    when instanceof Date
      ? when
      : typeof when === 'bigint'
        ? new Date(Number(when))
        : new Date(when);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  const units: ReadonlyArray<{ ms: number; unit: TimeDelta['unit']; short: string }> = [
    { ms: 60_000, unit: 'second', short: 's' },
    { ms: 3_600_000, unit: 'minute', short: 'm' },
    { ms: 86_400_000, unit: 'hour', short: 'h' },
    { ms: 30 * 86_400_000, unit: 'day', short: 'd' },
    { ms: 365 * 86_400_000, unit: 'month', short: 'mo' },
    { ms: Infinity, unit: 'year', short: 'y' },
  ];
  const idx = units.findIndex((u) => abs < u.ms);
  const safe = idx === -1 ? units.length - 1 : idx;
  const bucket = units[safe] ?? units[units.length - 1]!;
  const prev = safe === 0 ? 1 : (units[safe - 1]?.ms ?? 1);
  const value = Math.max(1, Math.round(abs / prev));

  const short = past ? `${value}${bucket.short} ago` : `in ${value}${bucket.short}`;
  const full = RTF ? RTF.format(past ? -value : value, bucket.unit) : short;
  return { value, unit: bucket.unit, past, short, full };
}

export function iso8601duration(ms: number | bigint): string {
  const n = typeof ms === 'bigint' ? Number(ms) : ms;
  if (!Number.isFinite(n) || n <= 0) return 'PT0S';
  const s = Math.floor(n / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const parts = [h ? `${h}H` : '', m ? `${m}M` : '', rem ? `${rem}S` : ''].filter(Boolean);
  return `PT${parts.join('') || '0S'}`;
}
