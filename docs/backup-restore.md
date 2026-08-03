# Backup, restore and disaster recovery

## What needs a backup, and what does not

| Store                           | Durable source of truth?                                                               | Backup strategy                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| PostgreSQL                      | Yes — every table in `apps/api/prisma/schema.prisma`                                   | Managed snapshots + logical `pg_dump` (below)              |
| Redis                           | No — see `docs/redis-production.md`'s "what Redis actually holds" table                | None. Cold-starting the cache is a non-event.              |
| Evidence bytes (object storage) | Not yet built — see `docs/architecture/evidence-chain-of-custody.md`'s "Not built yet" | See the note at the end of this document                   |
| Secrets (cloud secret manager)  | Yes, but durability is the provider's job, not this platform's                         | Out of scope here — that is what the secret manager is for |

## PostgreSQL backups

Two independent layers, on purpose — they cover different failure modes and
neither substitutes for the other:

1. **The managed provider's automated snapshots** (RDS automated backups,
   Cloud SQL automated backups, or equivalent). Configure retention and the
   backup window through the provider directly; that is provider-specific and
   not repeated here. This is the fast path for "an AZ went down" or
   "point-in-time-recovery to 20 minutes ago" — provider snapshots restore in
   place, on the provider's own infrastructure, quickly.
2. **A daily logical dump** (`k8s/base/backup-cronjob.yaml`, running
   `infra/docker/backup.sh`), shipped via `rclone` to object storage. This
   layer exists for what provider snapshots do not cover:
   - **Portability.** A plain-SQL dump restores into any Postgres, on any
     provider — the actual escape hatch if the reason for needing a restore
     is "leaving this provider," not just "something broke."
   - **A copy outside the provider's own blast radius.** A provider-side
     control-plane failure that takes snapshots down with it is a real
     failure mode logical backups do not share.
   - **A known-plain format.** `psql` can restore it on literally any
     Postgres install for a drill or a local repro, without needing
     `pg_restore` and matching server-version discipline.

### Setting it up

1. Point `BACKUP_DATABASE_URL` directly at Postgres, never through PgBouncer
   — `infra/docker/pgbouncer/generate-auth-function.sql` is unrelated here,
   since the backup needs one stable connection for the length of the dump,
   and transaction-mode pooling actively fights that (see
   `infra/docker/backup.sh`'s own comment).
2. Create a low-privilege `backup_user` role: `SELECT` on every table, nothing
   else. The backup CronJob's blast radius if its credentials ever leaked
   should be "can read everything" (already the point of a backup), never
   "can write or drop anything."
3. Populate `k8s/base/backup-secret.example.yaml`'s keys
   (`BACKUP_DATABASE_URL`, `BACKUP_REMOTE`, `rclone.conf`) into the real
   `aegisdrive-backup-secrets` Secret — same mechanism as
   `k8s/base/secret.example.yaml`, see `k8s/README.md`.
4. Build and push `infra/docker/backup.Dockerfile` as
   `ghcr.io/aegisdrive/postgres-backup` — the same release pipeline that
   builds the API/web/worker images (`.github/workflows/release.yml`) is the
   natural place to add this one.

### Restore procedure

```bash
# From a machine with rclone configured and network access to the target DB —
# a one-off pod running the postgres-backup image is the usual way to do
# this against a cluster:
kubectl run restore --rm -it --image=ghcr.io/aegisdrive/postgres-backup:latest \
  --overrides='{"spec":{"containers":[{"name":"restore","image":"ghcr.io/aegisdrive/postgres-backup:latest","command":["/usr/local/bin/restore.sh"],"env":[{"name":"BACKUP_REMOTE","value":"s3:my-backup-bucket/aegisdrive"}]}]}}' \
  -- aegisdrive-20260615T040000Z.sql.gz "$RESTORE_TARGET_DATABASE_URL"
```

Then, **before** pointing any API replica at the restored database:

```bash
DATABASE_URL="$RESTORE_TARGET_DATABASE_URL" pnpm --filter @aegisdrive/api run db:deploy
DATABASE_URL="$RESTORE_TARGET_DATABASE_URL" pnpm --filter @aegisdrive/api run db:seed
```

The dump is a snapshot from whenever the backup ran; any migration merged
after that point is not in it. `db:deploy` brings the schema current, and
`db:seed`'s RBAC-role reconciliation is idempotent and safe to run again (see
`docs/runbook.md`'s deployment order — this is that same sequence, just
starting from a restored database instead of a fresh one).

### Restore drills

A backup nobody has ever restored is a backup whose actual RTO is unknown.
Run the restore procedure above against a scratch database on a schedule (
quarterly is reasonable at this platform's size) — not "when a disaster
actually happens" — and record how long it took. That measured number is the
real RTO, not whatever is written below until it has been checked once.

## Recovery targets

|                      | Target                                                                                                                                                   | Why                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| RPO (PostgreSQL)     | ≤ 24 hours from the daily logical dump; effectively minutes from the provider's own point-in-time recovery, which should be the first restore path tried | The logical dump's cadence is the floor; PITR is what actually gets used first |
| RTO (PostgreSQL)     | To be measured by the first restore drill (see above)                                                                                                    | Anything asserted before that drill has run is a guess, not a target           |
| RPO (Redis)          | N/A — no backup, see the table above                                                                                                                     | Nothing durable is lost                                                        |
| RPO (Evidence bytes) | Not applicable yet — object-store integration is not built (see below)                                                                                   |                                                                                |

## Disaster scenarios and the first move

- **Accidental data deletion / a bad migration.** Provider point-in-time
  recovery to just before the bad statement, if the provider supports it;
  otherwise the logical dump restore procedure above, into a scratch
  database, followed by a targeted data fix rather than a full cutover.
- **Region-wide provider outage.** Provider snapshots are the provider's
  problem to make available elsewhere (that is the whole pitch of a managed
  Multi-AZ service); the logical dump on independent object storage is the
  fallback if that promise does not hold, restored fresh in a working region.
- **Compromised credentials.** Not a backup/restore scenario — see
  `docs/runbook.md`'s "Security incident: suspected credential compromise"
  section; rotating the JWT secrets and suspending accounts there is faster
  and more targeted than any restore.

## Evidence bytes: not yet applicable

The object-store integration for evidence artefacts is explicitly listed as
"not built yet" in `docs/architecture/evidence-chain-of-custody.md` — there is
no bucket in production today to back up. When that integration is built, its
provider choice (step 1 in that document's list) should be made alongside
enabling **versioning and cross-region replication** on the bucket, not as a
follow-up afterward: a version-controlled, replicated evidence store is a
chain-of-custody requirement in the same way object-lock/WORM already is, and
retrofitting versioning onto a bucket that already holds evidence is far
messier than enabling it from the first upload.
