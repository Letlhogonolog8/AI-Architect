#!/usr/bin/env bash
# Logical backup: pg_dump, gzipped, shipped to object storage, oldest copies
# pruned by age. Run as a Kubernetes CronJob (k8s/base/backup-cronjob.yaml).
#
# BACKUP_DATABASE_URL must point directly at Postgres, never through
# PgBouncer: pg_dump needs one stable connection for the length of the dump,
# and transaction-mode pooling (infra/docker/pgbouncer/pgbouncer.ini) actively
# fights that. It is a separate variable from the application's own
# DATABASE_URL for exactly this reason — see docs/backup-restore.md.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${BACKUP_REMOTE:?BACKUP_REMOTE is required, e.g. s3:my-bucket/aegisdrive}"
: "${BACKUP_RETENTION_DAYS:=30}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="/tmp/aegisdrive-${timestamp}.sql.gz"
remote_path="${BACKUP_REMOTE}/aegisdrive-${timestamp}.sql.gz"

echo "Dumping database to ${dump_file}..."
# --format=plain (the default): a plain SQL dump restores with `psql`, which
# every Postgres environment already has, rather than requiring pg_restore's
# custom format and matching server version discipline.
pg_dump --no-owner --no-privileges "${BACKUP_DATABASE_URL}" | gzip > "${dump_file}"

dump_size="$(du -h "${dump_file}" | cut -f1)"
echo "Dump complete (${dump_size}). Uploading to ${remote_path}..."

rclone copyto "${dump_file}" "${remote_path}" --config /etc/rclone/rclone.conf

echo "Upload complete. Pruning backups older than ${BACKUP_RETENTION_DAYS} days..."
rclone delete "${BACKUP_REMOTE}" --min-age "${BACKUP_RETENTION_DAYS}d" --config /etc/rclone/rclone.conf

rm -f "${dump_file}"
echo "Backup cycle complete: aegisdrive-${timestamp}.sql.gz"
