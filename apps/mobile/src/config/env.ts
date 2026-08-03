/**
 * Device-visible configuration.
 *
 * Expo inlines `EXPO_PUBLIC_*` at build time, so every value here is readable
 * by anyone who unpacks the binary. Nothing secret belongs in this file.
 */
export interface MobileEnv {
  apiBaseUrl: string;
  realtimeUrl: string;
  environment: string;
  /** Position reports per minute during an active trip. */
  telemetryRatePerMinute: number;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} is not configured. Copy .env.example to .env and rebuild — Expo inlines these at build time, so a running app cannot pick up a change.`,
    );
  }
  return value.trim();
}

export const mobileEnv: MobileEnv = {
  apiBaseUrl: required('EXPO_PUBLIC_API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL),
  realtimeUrl: required('EXPO_PUBLIC_REALTIME_URL', process.env.EXPO_PUBLIC_REALTIME_URL),
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
  telemetryRatePerMinute: Number(process.env.EXPO_PUBLIC_TELEMETRY_RATE_PER_MINUTE ?? '12'),
};
