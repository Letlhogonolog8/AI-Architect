import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import { mobileEnv } from '@/config/env';
import { openDatabase } from '@/db/database';
import { enqueue } from '@/db/outbox';
import { TelemetrySource } from '@/types';

/**
 * Background location tracking — the core of the driver app.
 *
 * Three constraints shape everything here:
 *
 *   1. **The OS is hostile to background work.** iOS suspends apps aggressively
 *      and Android kills services under memory pressure. The task is registered
 *      at module scope so the OS can restart it into a cold process; registering
 *      it inside a component would mean it simply never runs after a kill.
 *
 *   2. **Battery is a product constraint.** A driver whose phone dies is
 *      unprotected. `deferredUpdatesInterval` lets the OS batch reports while
 *      stationary rather than waking the radio on a fixed timer.
 *
 *   3. **Frames must survive a dead zone and a process kill.** Frames go to
 *      SQLite, not to an in-memory array — the buffer exists precisely for the
 *      case where the app is about to be killed, and an in-memory one would be
 *      lost in exactly that moment.
 */

export const LOCATION_TASK = 'aegisdrive-background-location';

export interface TelemetryFrame {
  recordedAt: string;
  longitude: number;
  latitude: number;
  altitude: number | null;
  heading: number | null;
  speedKph: number | null;
  accuracy: number | null;
}

/**
 * Most recent fix, held in memory for instant reads.
 *
 * Panic activation uses this rather than requesting a fresh fix: a GPS lock can
 * take thirty seconds, and an activation carrying a ninety-second-old position
 * is far better than one still acquiring.
 */
let lastFrame: TelemetryFrame | null = null;

export function latestFrame(): TelemetryFrame | null {
  return lastFrame;
}

export function currentPosition(): { longitude: number; latitude: number } | null {
  return lastFrame ? { longitude: lastFrame.longitude, latitude: lastFrame.latitude } : null;
}

function toFrame(location: Location.LocationObject): TelemetryFrame {
  return {
    recordedAt: new Date(location.timestamp).toISOString(),
    longitude: location.coords.longitude,
    latitude: location.coords.latitude,
    altitude: location.coords.altitude,
    heading: location.coords.heading,
    // Expo reports metres per second; the API contract is km/h.
    speedKph: location.coords.speed === null ? null : location.coords.speed * 3.6,
    accuracy: location.coords.accuracy,
  };
}

/** Persists frames so they survive the process being killed. */
async function bufferFrames(frames: TelemetryFrame[]): Promise<void> {
  if (frames.length === 0) return;

  const database = await openDatabase();

  await database.withTransactionAsync(async () => {
    for (const frame of frames) {
      await database.runAsync(
        'INSERT OR REPLACE INTO telemetry_buffer (id, recorded_at, payload) VALUES (?, ?, ?);',
        Crypto.randomUUID(),
        Date.parse(frame.recordedAt),
        JSON.stringify(frame),
      );
    }
  });
}

/**
 * Moves buffered frames into the outbox as one batch.
 *
 * Batched rather than per-frame because the API's ingest endpoint takes up to
 * 500 frames per request, and one request per fix would drain the battery
 * through the radio alone.
 */
export async function flushTelemetry(vehicleId: string): Promise<number> {
  const database = await openDatabase();

  const rows = await database.getAllAsync<{ id: string; payload: string }>(
    'SELECT id, payload FROM telemetry_buffer ORDER BY recorded_at ASC LIMIT 500;',
  );

  if (rows.length === 0) return 0;

  const frames = rows.map((row) => JSON.parse(row.payload) as TelemetryFrame);

  await enqueue('TELEMETRY_BATCH', {
    vehicleId,
    source: TelemetrySource.MOBILE_APP,
    frames: frames.map((frame) => ({
      recordedAt: frame.recordedAt,
      position: {
        longitude: frame.longitude,
        latitude: frame.latitude,
        altitude: frame.altitude,
        heading: frame.heading,
        speedKph: frame.speedKph,
        accuracy: frame.accuracy,
      },
      ignitionOn: true,
      harshBraking: false,
      harshAcceleration: false,
    })),
  });

  // Only cleared once the outbox owns them, so a crash between the two loses
  // nothing — at worst a batch is queued twice, and the API's ingest is
  // idempotent by design (`skipDuplicates`).
  const placeholders = rows.map(() => '?').join(',');
  await database.runAsync(
    `DELETE FROM telemetry_buffer WHERE id IN (${placeholders});`,
    ...rows.map((row) => row.id),
  );

  return frames.length;
}

export async function bufferedFrameCount(): Promise<number> {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM telemetry_buffer;',
  );
  return row?.count ?? 0;
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    // Throwing here is swallowed by the OS task runner and can stop the task
    // being scheduled again. Log and stay alive instead.
    console.error('Background location task error', error);
    return;
  }

  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations ?? [];
  if (locations.length === 0) return;

  const frames = locations.map(toFrame);
  lastFrame = frames[frames.length - 1] ?? lastFrame;

  await bufferFrames(frames);
});

export interface TrackingPermissions {
  foreground: boolean;
  background: boolean;
}

/**
 * Requests tracking permission.
 *
 * Foreground must be granted before background can even be requested — asking
 * for both at once is rejected on both platforms.
 */
export async function requestTrackingPermissions(): Promise<TrackingPermissions> {
  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== 'granted') {
    return { foreground: false, background: false };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: background.status === 'granted' };
}

export async function trackingPermissions(): Promise<TrackingPermissions> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);

  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
  };
}

export async function isTracking(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
}

export async function startTracking(): Promise<void> {
  if (await isTracking()) return;

  const intervalMs = Math.round(60_000 / Math.max(1, mobileEnv.telemetryRatePerMinute));

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: intervalMs,
    distanceInterval: 25,
    // Batches updates while the device is stationary, which is where nearly all
    // of the battery saving comes from.
    deferredUpdatesInterval: intervalMs * 4,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'AEGISDRIVE protection active',
      notificationBody: 'Your vehicle is being monitored.',
      notificationColor: '#2E8BFF',
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (!(await isTracking())) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

/**
 * One-shot fix, for the map and the trip screen.
 *
 * Separate from the background stream: the background task is tuned for battery
 * and may be several seconds stale, which is fine for telemetry and wrong for
 * "where am I now" on a screen the driver is looking at.
 */
export async function readCurrentPosition(): Promise<TelemetryFrame | null> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const frame = toFrame(location);
    lastFrame = frame;
    return frame;
  } catch {
    return lastFrame;
  }
}
