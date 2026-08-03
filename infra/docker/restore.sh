#!/usr/bin/env bash
# Restores one backup produced by backup.sh. Run by hand — a restore is never
# automatic — either during the quarterly drill in docs/backup-restore.md or
# an actual disaster recovery event.
#
# Usage: restore.sh <backup-filename> <target-database-url>
#   restore.sh aegisdrive-20260615T040000Z.sql.gz "$RESTORE_TARGET_DATABASE_URL"
#
# The target must be an *empty* database. This script does not drop or
# truncate anything first — running it against a live database on purpose,
# to overwrite it, is exactly the kind of action that should require a human
# to have typed out the connection string themselves, not have it default to
# whatever was last in the environment.
set -euo pipefail

backup_filename="${1:?Usage: restore.sh <backup-filename> <target-database-url>}"
target_database_url="${2:?Usage: restore.sh <backup-filename> <target-database-url>}"

: "${BACKUP_REMOTE:?BACKUP_REMOTE is required, e.g. s3:my-bucket/aegisdrive}"

dump_file="/tmp/${backup_filename}"

echo "Fetching ${backup_filename} from ${BACKUP_REMOTE}..."
rclone copyto "${BACKUP_REMOTE}/${backup_filename}" "${dump_file}" --config /etc/rclone/rclone.conf

echo "Restoring into target database. This can take a while for a large dump..."
gunzip -c "${dump_file}" | psql --set ON_ERROR_STOP=on "${target_database_url}"

echo "Restore complete. Next: run 'prisma migrate deploy' against the target"
echo "to apply any migration committed after this backup was taken (see"
echo "docs/backup-restore.md's restore procedure) before pointing the API at it."

rm -f "${dump_file}"
