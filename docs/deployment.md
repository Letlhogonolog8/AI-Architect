# Production deployment

The index for everything involved in running this platform in production.
Each linked document owns its own detail; this one is the map between them
and the order to read them in for a first deploy.

## Before the first deploy: the one placeholder to replace

Every Kubernetes manifest and the release workflow refer to the same fixed
placeholder namespace, `ghcr.io/aegisdrive/*`:

- `k8s/base/kustomization.yaml` and every overlay's `images:` block
- `.github/workflows/release.yml`'s `IMAGE_NAMESPACE` env var
- `k8s/base/*-deployment.yaml` and `backup-cronjob.yaml`'s `image:` fields

These must agree, and `IMAGE_NAMESPACE` in particular must match the real
GitHub org/user this repository lives under — `GITHUB_TOKEN`-based pushes to
GHCR (`.github/workflows/release.yml`'s `build-and-push` job) are scoped to
packages under the actual repository owner, not an arbitrary string. Replace
`aegisdrive` with the real namespace everywhere above, together, before the
release pipeline can push or the manifests can pull anything.

## What "production" is built from

| Layer                | Where                                                                                                            | Doc                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Containers           | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `infra/docker/worker.Dockerfile`, `infra/docker/backup.Dockerfile` | —                                       |
| Orchestration        | `k8s/base` + `k8s/overlays/{staging,production}` (Kustomize)                                                     | `k8s/README.md`                         |
| CI                   | `.github/workflows/ci.yml` — typecheck, unit tests, migration replay, image build + scan                         | —                                       |
| CD                   | `.github/workflows/release.yml` — build, push, deploy                                                            | This document, "Release pipeline" below |
| Monitoring           | Prometheus (`infra/monitoring/prometheus`) + Grafana, `/metrics` on the API                                      | "Monitoring" below                      |
| Logging              | Structured stdout everywhere, aggregated via Loki/Promtail or a cluster DaemonSet                                | `docs/logging.md`                       |
| PostgreSQL           | Managed provider recommended; PgBouncer fallback; indexing already done                                          | `docs/postgres-optimization.md`         |
| Redis                | Managed provider recommended; nothing durable, no backup needed                                                  | `docs/redis-production.md`              |
| Backup / DR          | Daily logical Postgres dump + provider snapshots                                                                 | `docs/backup-restore.md`                |
| Security             | NetworkPolicies, Pod Security Standards, image scanning, CodeQL, Dependabot                                      | `docs/security-hardening.md`            |
| Day-to-day operation | Health probes, deployment order, incident response                                                               | `docs/runbook.md`                       |

## Required secrets

Populate before the release workflow's deploy jobs will do anything — see
`.github/workflows/release.yml`'s `check-cluster-credentials` job, which
skips (not fails) both deploys until these exist:

| Secret                              | Used by             | Purpose                                           |
| ----------------------------------- | ------------------- | ------------------------------------------------- |
| `KUBE_CONFIG_STAGING`               | `deploy-staging`    | Base64-encoded kubeconfig for the staging cluster |
| `KUBE_CONFIG_PRODUCTION`            | `deploy-production` | Same, for production                              |
| `STAGING_MIGRATION_DATABASE_URL`    | `deploy-staging`    | Migration-privileged connection string, staging   |
| `PRODUCTION_MIGRATION_DATABASE_URL` | `deploy-production` | Same, production                                  |

`GITHUB_TOKEN` (automatic, no setup) covers pushing images to GHCR. In-cluster
secrets (`aegisdrive-secrets`, `aegisdrive-backup-secrets`) are separate —
see `k8s/README.md`'s "Secrets" section; they are populated directly in the
cluster (via External Secrets Operator or a one-time `kubectl create secret`),
not through GitHub Actions.

A GitHub **Environment** named `production` with required reviewers
configured in this repo's Settings → Environments is what actually makes a
tag push a gated, approved deploy — `deploy-production`'s `environment:
production` in the workflow only references that protection rule, it does
not create it.

## Release pipeline

```
push to main  ──► build-and-push (all 6 images, tag: sha-xxxxxxx)
                       │
                       ▼
                  deploy-staging (if KUBE_CONFIG_STAGING is set)
                       │
                  migrate → pin images to this commit → apply → wait for rollout

git tag v1.2.3 ──► build-and-push (tag: v1.2.3, plus `latest`)
                       │
                       ▼
                  deploy-production (if KUBE_CONFIG_PRODUCTION is set,
                                      and the `production` environment
                                      approves it)
                       │
                  migrate → pin images to this release → apply → wait for rollout
```

Both deploy jobs follow `docs/runbook.md`'s deployment order — migrations,
then the workload manifests — as separate steps rather than folding a
migration Job into the same `kubectl apply -k`, because that ordering cannot
be guaranteed if both happen in one apply.

## Monitoring

```bash
docker compose -f infra/docker/docker-compose.yml --profile monitoring --profile full up -d
```

locally, or in a real cluster either the Prometheus/Grafana stack this repo's
compose file mirrors, or `k8s/base/servicemonitor.example.yaml` against an
existing kube-prometheus-stack install. `infra/monitoring/grafana/dashboards/aegisdrive-api.json`
is provisioned automatically — request rate, error ratio, latency
percentiles, dependency health, realtime client count, rate-limit
rejections, event-loop lag, process memory/CPU. Alert rules are in
`infra/monitoring/prometheus/alerts.yml`; see that file's own comment on the
one known gap (evidence integrity failures have no metric yet).

## First production deploy, end to end

1. Replace the `aegisdrive` placeholder namespace everywhere listed above.
2. Provision the managed Postgres and Redis (see their respective docs for
   why managed is the default recommendation here, not self-hosted).
3. Populate `k8s/base/secret.example.yaml`'s keys into the real
   `aegisdrive-secrets` Secret in each cluster/namespace.
4. If backups are wanted from day one (they should be): create a read-only
   Postgres role for the backup CronJob and populate
   `k8s/base/backup-secret.example.yaml`'s keys — see `docs/backup-restore.md`'s
   setup steps.
5. Set up cert-manager and an nginx ingress controller in the cluster —
   both are cluster-wide add-ons this repo assumes exist, not part of its
   own manifests (`k8s/README.md`).
6. Add the four GitHub Actions secrets above, and configure the
   `production` Environment's required reviewers.
7. Merge to `main` — this alone deploys to staging automatically. Verify it
   there first; that is what staging is for.
8. Tag a release (`git tag v1.0.0 && git push --tags`) to reach production,
   and approve the `production` Environment's review gate when prompted.
9. Run a restore drill (`docs/backup-restore.md`) before the first real
   incident, not after.
