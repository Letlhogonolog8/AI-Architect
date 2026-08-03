import * as SQLite from 'expo-sqlite';

/**
 * Local database.
 *
 * SQLite rather than AsyncStorage for everything that must survive the process
 * being killed. Android will terminate a backgrounded app under memory
 * pressure without warning, and the two things this app cannot afford to lose
 * in that moment are the panic outbox and the telemetry buffer — both of which
 * exist precisely because the network was unavailable.
 *
 * Migrations are forward-only and idempotent. A driver's phone may be several
 * versions behind, and a failed migration must never leave the outbox
 * unreadable.
 */

const DATABASE_NAME = 'aegisdrive.db';

let database: SQLite.SQLiteDatabase | null = null;

const MIGRATIONS: readonly { version: number; statements: readonly string[] }[] = [
  {
    version: 1,
    statements: [
      // Durable outbox. Every mutation the app makes while offline lands here
      // first and is drained by the sync engine.
      `CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        -- Lower sorts first. Panic is 0 so it drains ahead of everything.
        priority INTEGER NOT NULL DEFAULT 100
      );`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_drain
         ON outbox (priority ASC, next_attempt_at ASC, created_at ASC);`,

      // Telemetry frames captured while offline.
      `CREATE TABLE IF NOT EXISTS telemetry_buffer (
        id TEXT PRIMARY KEY NOT NULL,
        recorded_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_telemetry_recorded
         ON telemetry_buffer (recorded_at ASC);`,

      // Locally captured evidence, before upload.
      `CREATE TABLE IF NOT EXISTS evidence_queue (
        id TEXT PRIMARY KEY NOT NULL,
        incident_id TEXT,
        type TEXT NOT NULL,
        file_uri TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        duration_seconds INTEGER,
        checksum TEXT NOT NULL,
        captured_at INTEGER NOT NULL,
        uploaded INTEGER NOT NULL DEFAULT 0
      );`,

      // Operator ↔ driver thread, cached so it is readable with no signal.
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        incident_id TEXT,
        direction TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        read_at INTEGER,
        sender_name TEXT,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_messages_sent ON messages (sent_at DESC);`,

      // Emergency contacts. Cached locally because they are needed most when
      // there is no connectivity to fetch them.
      `CREATE TABLE IF NOT EXISTS emergency_contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        notify_on_incident INTEGER NOT NULL DEFAULT 1
      );`,

      // Last-known server state, so the dashboard renders instantly on launch
      // rather than showing skeletons before the first response.
      `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
    ],
  },
];

export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;

  const handle = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL: concurrent reads while the sync engine writes. Without it the UI
  // blocks whenever the outbox drains.
  await handle.execAsync('PRAGMA journal_mode = WAL;');
  await handle.execAsync('PRAGMA foreign_keys = ON;');

  await migrate(handle);

  database = handle;
  return handle;
}

async function migrate(handle: SQLite.SQLiteDatabase): Promise<void> {
  const row = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    await handle.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await handle.execAsync(statement);
      }
    });

    // `user_version` cannot be parameterised, hence the interpolation. The
    // value is a hard-coded integer from this file, never external input.
    await handle.execAsync(`PRAGMA user_version = ${migration.version};`);
  }
}

/** Test and reset hook. Never called from application code. */
export async function closeDatabase(): Promise<void> {
  await database?.closeAsync();
  database = null;
}
