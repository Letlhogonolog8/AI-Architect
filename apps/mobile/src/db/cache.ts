import { openDatabase } from './database';

/**
 * Last-known-good cache.
 *
 * Server responses the app must still be able to show with no signal: routes,
 * hotspots, emergency contacts, the assigned vehicle. Distinct from the outbox,
 * which holds things going the other way.
 *
 * Reads never throw. A corrupt or missing cache entry returns null and the
 * caller falls back to its empty state — a driver in a basement should see a
 * degraded screen, not a crash.
 */

export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    const database = await openDatabase();
    await database.runAsync(
      'INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?);',
      key,
      JSON.stringify(value),
      Date.now(),
    );
  } catch (error) {
    console.warn(`Cache write failed for '${key}'`, error);
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const database = await openDatabase();
    const row = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM cache WHERE key = ?;',
      key,
    );

    return row ? (JSON.parse(row.value) as T) : null;
  } catch (error) {
    console.warn(`Cache read failed for '${key}'`, error);
    return null;
  }
}

/** Age of a cache entry in milliseconds, so the UI can say how stale it is. */
export async function cacheAge(key: string): Promise<number | null> {
  try {
    const database = await openDatabase();
    const row = await database.getFirstAsync<{ updated_at: number }>(
      'SELECT updated_at FROM cache WHERE key = ?;',
      key,
    );

    return row ? Date.now() - row.updated_at : null;
  } catch {
    return null;
  }
}
