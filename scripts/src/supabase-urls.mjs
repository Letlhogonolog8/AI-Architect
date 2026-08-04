/**
 * Derives the two Supabase connection strings from a single password.
 *
 * Supabase exposes a project three ways, and which one belongs in `DATABASE_URL`
 * depends on how the client is deployed. Measured from Johannesburg against
 * eu-west-1 on 4 August 2026, where the raw TCP round trip is 181ms:
 *
 *                            select 1     user lookup   10 parallel
 *   transaction pooler 6543    905ms         950ms         9233ms
 *   session pooler     5432    182ms         366ms         1669ms
 *
 * Transaction mode costs roughly five round trips per query because every
 * statement is its own pooled transaction and prepared statements are
 * unavailable. That trade is worth it for serverless functions, which cannot
 * hold a connection between invocations. AEGISDRIVE's API is a long-running
 * process with its own Prisma pool, so it wants the opposite: session mode,
 * one round trip, prepared statements intact.
 *
 * Hence both URLs point at the session pooler and differ only in pool size:
 *
 *   - `DATABASE_URL` — session pooler, pool sized for concurrent requests.
 *   - `DIRECT_URL`   — same endpoint, single connection, for migrations.
 *
 * The pooler hostname is region-shared but its prefix (`aws-0`, `aws-1`, …)
 * varies by when the project was provisioned, and the direct host
 * (`db.<ref>.supabase.co`) is IPv6-only without the IPv4 add-on. Rather than
 * guess either, this probes the candidates and keeps what actually connects.
 *
 * Usage:  node scripts/src/supabase-urls.mjs [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV_PATH = path.join(ROOT, 'apps/api/.env');

// Probe with Prisma's own client rather than adding a `pg` dependency just for
// this: it is already installed, and it is the driver that actually has to work.
const require = createRequire(path.join(ROOT, 'apps/api/package.json'));
const { PrismaClient } = require('@prisma/client');

const PROJECT_REF = 'uprhszahxdgounhstwpe';
const REGION = 'eu-west-1';

function readEnv() {
  const text = readFileSync(ENV_PATH, 'utf8');
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) map.set(match[1], match[2].trim());
  }
  return { text, map };
}

/** Opens a real connection and runs one query. Anything less proves nothing. */
async function probe(url, label) {
  const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    const rows = await prisma.$queryRaw`select current_database() as db, version() as v`;
    await prisma.$disconnect();
    const { db, v } = rows[0];
    return { ok: true, label, db, version: v.split(' ').slice(0, 2).join(' ') };
  } catch (error) {
    await prisma.$disconnect().catch(() => {});
    const line = String(error.message)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .find((s) => /error|cannot|refused|timeout|authentication|does not exist|ENOTFOUND/i.test(s));
    return { ok: false, label, error: line ?? String(error.message).slice(0, 120) };
  }
}

const { text, map } = readEnv();
const password = map.get('SUPABASE_DB_PASSWORD');

if (!password) {
  console.error(
    `SUPABASE_DB_PASSWORD is empty in apps/api/.env.\n` +
      `Set it from https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database`,
  );
  process.exit(1);
}

const encoded = encodeURIComponent(password);
const poolerUser = `postgres.${PROJECT_REF}`;

/**
 * Prisma pool size for the running API.
 *
 * In session mode each pooled client holds a real Postgres connection for its
 * lifetime, so this is a claim on the project's connection budget rather than a
 * free-floating number. Ten leaves ample headroom for one API instance; raise it
 * only alongside the project's pool size, and divide it across replicas.
 */
const RUNTIME_POOL = 10;

// Ordered best-first within each role.
const runtimeCandidates = [
  [`aws-0-${REGION}`, 'session pooler (aws-0)'],
  [`aws-1-${REGION}`, 'session pooler (aws-1)'],
].map(([host, label]) => [
  `postgresql://${poolerUser}:${encoded}@${host}.pooler.supabase.com:5432/postgres?connection_limit=${RUNTIME_POOL}`,
  label,
]);

const migrationCandidates = [
  [
    `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    'direct (db.<ref>, needs IPv6)',
  ],
  [
    `postgresql://${poolerUser}:${encoded}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`,
    'session pooler (aws-0)',
  ],
  [
    `postgresql://${poolerUser}:${encoded}@aws-1-${REGION}.pooler.supabase.com:5432/postgres`,
    'session pooler (aws-1)',
  ],
];

async function firstWorking(candidates, role) {
  console.log(`\nProbing ${role}:`);
  for (const [url, label] of candidates) {
    const result = await probe(url, label);
    if (result.ok) {
      console.log(`  ✓ ${label} — ${result.db}, ${result.version}`);
      return url;
    }
    console.log(`  ✗ ${label} — ${result.error}`);
  }
  return null;
}

const runtimeUrl = await firstWorking(runtimeCandidates, 'runtime (DATABASE_URL)');
const migrationUrl = await firstWorking(migrationCandidates, 'migrations (DIRECT_URL)');

if (!runtimeUrl || !migrationUrl) {
  console.error('\nNo working connection found. Check the password and that the project is active.');
  process.exit(1);
}

if (process.argv.includes('--write')) {
  const updated = text
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${runtimeUrl}`)
    .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL=${migrationUrl}`);
  writeFileSync(ENV_PATH, updated);
  console.log('\nWrote DATABASE_URL and DIRECT_URL to apps/api/.env');
} else {
  console.log('\nBoth reachable. Re-run with --write to save them into apps/api/.env');
}
