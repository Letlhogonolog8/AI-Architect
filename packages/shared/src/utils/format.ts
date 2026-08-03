/** Presentation helpers shared by the web and mobile clients. */

/** `Jane Doe`, tolerating missing halves without leaving stray whitespace. */
export function fullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/** `JD` for avatars. Falls back to the first two characters of a single name. */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const single = first || last;
  return single.slice(0, 2).toUpperCase();
}

/** `SCREAMING_SNAKE` enum values rendered as `Screaming snake`. */
export function humaniseEnum(value: string): string {
  const lowered = value.toLowerCase().replace(/_/g, ' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** Byte counts as `1.4 MB`. Uses decimal units, matching what object stores report. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : fractionDigits)} ${units[exponent]}`;
}

/** Durations as `1h 04m 09s`, dropping leading zero units. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0s';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Compact relative time (`4m ago`, `in 2h`) without pulling in a date library. */
export function relativeTime(value: string | number | Date, now: Date = new Date()): string {
  const target = value instanceof Date ? value : new Date(value);
  const deltaSeconds = Math.round((target.getTime() - now.getTime()) / 1000);
  const past = deltaSeconds < 0;
  const magnitude = Math.abs(deltaSeconds);

  const thresholds: Array<[limit: number, divisor: number, suffix: string]> = [
    [60, 1, 's'],
    [3600, 60, 'm'],
    [86_400, 3600, 'h'],
    [604_800, 86_400, 'd'],
    [2_629_800, 604_800, 'w'],
    [Number.POSITIVE_INFINITY, 2_629_800, 'mo'],
  ];

  const match = thresholds.find(([limit]) => magnitude < limit);
  if (!match) return past ? 'a while ago' : 'in a while';

  const [, divisor, suffix] = match;
  const amount = Math.max(1, Math.floor(magnitude / divisor));
  return past ? `${amount}${suffix} ago` : `in ${amount}${suffix}`;
}

/** Vehicle registrations are stored and compared in a single canonical form. */
export function normaliseRegistration(registration: string): string {
  return registration.toUpperCase().replace(/[\s-]/g, '');
}
