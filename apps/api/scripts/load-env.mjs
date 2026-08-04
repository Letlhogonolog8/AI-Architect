/**
 * Loads `apps/api/.env` and lets it win over the ambient environment.
 *
 * Node's `--env-file` deliberately does *not* overwrite variables that are
 * already set, which is the right default for a deployed process — the
 * orchestrator's values should beat a file baked into the image.
 *
 * It is the wrong default for local development. A developer machine
 * accumulates persistent `DATABASE_URL` and `PORT` exports from unrelated
 * projects, and those silently outrank this app's own config: the API binds
 * the wrong port and connects to another project's database, which surfaces
 * much later as a baffling schema error rather than as a configuration
 * mistake.
 *
 * So this is dev-only, and refuses to run in production, where the deployed
 * environment must stay authoritative.
 *
 * Wired in through `tsx --import`, so it runs before any application module is
 * evaluated and before `src/config/env.ts` validates anything.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');

if (process.env.NODE_ENV === 'production') {
  // Nothing to do: the process environment is the source of truth.
} else {
  let contents;
  try {
    contents = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // No .env is a legitimate setup — config validation reports what is missing.
    contents = null;
  }

  if (contents !== null) {
    const overridden = [];

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;

      // Split on the first `=` only: values legitimately contain more of them,
      // such as `?pgbouncer=true&connection_limit=1` in a pooled Postgres URL.
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();

      // Strip one matched pair of surrounding quotes, if present.
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] !== undefined && process.env[key] !== value) {
        overridden.push(key);
      }
      process.env[key] = value;
    }

    if (overridden.length > 0) {
      // Say so rather than doing it silently — an inherited value that differs
      // from the file is exactly the situation that wastes an afternoon.
      process.stderr.write(
        `[env] apps/api/.env overrode inherited ${overridden.join(', ')}\n`,
      );
    }
  }
}
