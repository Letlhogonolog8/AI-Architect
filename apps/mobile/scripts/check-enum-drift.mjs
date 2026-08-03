#!/usr/bin/env node
/**
 * Guards the enum mirror.
 *
 * `apps/mobile` cannot import `@aegisdrive/types` (ADR-0003), so
 * `src/types/enums.ts` duplicates the canonical enums. Those string values are
 * load-bearing across the API, the web console and this app — a mismatch is a
 * silent data bug that surfaces as a rejected payload or, worse, as a wrongly
 * classified incident.
 *
 * This compares every enum member the mirror declares against the canonical
 * file. The mirror is allowed to declare *fewer* enums (the driver app does not
 * need `AuditAction`), but every enum it does declare must match exactly.
 *
 *   node scripts/check-enum-drift.mjs
 *
 * Exit 0 = in sync. Exit 1 = drift, with the differences printed.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MIRROR = resolve(here, '../src/types/enums.ts');

/**
 * Canonical enums are split across two files upstream: the core domain in
 * `enums.ts`, and the command-centre additions (corridors, responders, camera
 * and AI decision states) in `command-centre.ts`. Both are scanned, because a
 * mirror entry is valid if it matches either.
 */
const CANONICAL_SOURCES = [
  resolve(here, '../../../packages/types/src/enums.ts'),
  resolve(here, '../../../packages/types/src/command-centre.ts'),
];

/**
 * Extracts `export const Name = { KEY: 'VALUE', ... } as const;` blocks.
 *
 * A regex rather than the TypeScript compiler API: this script must run before
 * dependencies are installed, in a package that does not depend on typescript
 * at all.
 */
function parseEnums(source, label) {
  const enums = new Map();
  const blockPattern = /export const (\w+) = \{([\s\S]*?)\} as const;/g;

  let block;
  while ((block = blockPattern.exec(source)) !== null) {
    const [, name, body] = block;
    const members = new Map();

    const memberPattern = /(\w+)\s*:\s*'([^']*)'/g;
    let member;
    while ((member = memberPattern.exec(body)) !== null) {
      members.set(member[1], member[2]);
    }

    if (members.size === 0) continue;

    if (enums.has(name)) {
      throw new Error(`${label}: '${name}' is declared more than once.`);
    }
    enums.set(name, members);
  }

  return enums;
}

function main() {
  let mirror;
  const canonical = new Map();

  try {
    mirror = parseEnums(readFileSync(MIRROR, 'utf8'), 'mirror');

    for (const source of CANONICAL_SOURCES) {
      for (const [name, members] of parseEnums(readFileSync(source, 'utf8'), source)) {
        canonical.set(name, members);
      }
    }
  } catch (error) {
    process.stderr.write(`Could not read enum sources: ${error.message}\n`);
    process.exit(1);
  }

  const problems = [];

  for (const [enumName, mirrorMembers] of mirror) {
    const canonicalMembers = canonical.get(enumName);

    if (!canonicalMembers) {
      problems.push(
        `${enumName}: declared in the mobile mirror but not in packages/types. Remove it, or add it upstream first.`,
      );
      continue;
    }

    for (const [key, value] of mirrorMembers) {
      const canonicalValue = canonicalMembers.get(key);

      if (canonicalValue === undefined) {
        problems.push(`${enumName}.${key}: present in the mirror, absent upstream.`);
      } else if (canonicalValue !== value) {
        problems.push(
          `${enumName}.${key}: mirror has '${value}', upstream has '${canonicalValue}'.`,
        );
      }
    }

    for (const key of canonicalMembers.keys()) {
      if (!mirrorMembers.has(key)) {
        problems.push(
          `${enumName}.${key}: added upstream but missing from the mirror. The driver app will not recognise this value.`,
        );
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write('Enum mirror has drifted from packages/types:\n\n');
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.stderr.write(
      '\nFix apps/mobile/src/types/enums.ts to match. packages/types is the source of truth.\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    `Enum mirror is in sync (${mirror.size} enums checked against packages/types).\n`,
  );
}

main();
