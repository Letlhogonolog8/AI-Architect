# Logical (pg_dump) backup image, run on a schedule by k8s/base/backup-cronjob.yaml.
#
# This backup is deliberately provider-agnostic: rclone speaks S3, GCS, Azure
# Blob and a dozen others through one config file, so the same image works
# whichever object store the deployment target actually uses — see
# docs/backup-restore.md for why a logical dump is a *supplement* to the
# managed Postgres provider's own automated snapshots, not a replacement.
FROM postgres:16-alpine

RUN apk add --no-cache rclone bash

# gosu ships with the postgres image so its own entrypoint can drop privileges.
# This image replaces that entrypoint with backup.sh, which calls only pg_dump,
# gzip and rclone and already runs as `postgres` — so gosu is dead weight, and
# it is a Go binary carrying 15 HIGH/CRITICAL advisories that no base-image
# upgrade clears. Removing it is both the smaller and the safer image.
RUN rm -f /usr/local/bin/gosu

# Paths are relative to the repository root, which is the build context every
# image here uses (see the `docker` job in .github/workflows/ci.yml). Bare
# `backup.sh` would only resolve if the context were infra/docker.
COPY infra/docker/backup.sh /usr/local/bin/backup.sh
COPY infra/docker/restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

USER postgres

ENTRYPOINT ["/usr/local/bin/backup.sh"]
