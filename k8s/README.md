# Kubernetes manifests

Kustomize-based: `base/` holds the shape common to every environment,
`overlays/{staging,production}` patch what actually differs (namespace,
replica counts, hostnames, image tags, resource sizing).

```bash
kubectl kustomize k8s/overlays/staging      # render, to review before applying
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/production
```

## What is and is not here

Deployed: `api`, `web`, and the three background workers
(`notifications-worker`, `telemetry-worker`, `evidence-worker`), matching
`infra/docker/docker-compose.yml`'s `full` profile.

**Not deployed as Kubernetes StatefulSets: PostgreSQL and Redis.** Both are
assumed to be managed services (RDS/Cloud SQL/Aiven for Postgres,
ElastiCache/Memorystore for Redis) reached over `DATABASE_URL` / `REDIS_URL`
in the Secret. Running a stateful database inside the same cluster as the
application it serves means the app's own deploys, node drains and
autoscaling events can now also take down its data store — a coupling worth
paying an operator to avoid. If a managed service is genuinely not an option,
`infra/docker/docker-compose.yml` already documents a Postgres and Redis
configuration that can be lifted into a StatefulSet, but that is a deliberate
extra step, not the default here.

`services/ai` (the Python inference gateway) has no Dockerfile yet and is not
deployed by these manifests; `AI_SERVICE_URL` in the API's config is wired for
it but currently unset everywhere.

`base/backup-cronjob.yaml` runs a daily logical Postgres backup alongside
whatever automated snapshots the managed provider already takes — see
`docs/backup-restore.md` for why both layers exist and how to restore one.
`base/pgbouncer.example.yaml` is the connection-pooling fallback for a
provider with no native pooler — see `docs/postgres-optimization.md`.

## Secrets

`base/secret.example.yaml` documents the keys every Deployment expects
(`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`INTERNAL_SERVICE_TOKEN`) but is **not** in `kustomization.yaml`'s resource
list — it is reference documentation, not something `kubectl apply -k` will
ever create. Populate the real `aegisdrive-secrets` Secret with one of:

- **External Secrets Operator** (recommended), syncing from your cloud's
  secret manager:

  ```yaml
  apiVersion: external-secrets.io/v1beta1
  kind: ExternalSecret
  metadata:
    name: aegisdrive-secrets
  spec:
    secretStoreRef: { name: aws-secrets-manager, kind: ClusterSecretStore }
    target: { name: aegisdrive-secrets }
    data:
      - secretKey: DATABASE_URL
        remoteRef: { key: aegisdrive/production/database-url }
      - secretKey: REDIS_URL
        remoteRef: { key: aegisdrive/production/redis-url }
      - secretKey: JWT_ACCESS_SECRET
        remoteRef: { key: aegisdrive/production/jwt-access-secret }
      - secretKey: JWT_REFRESH_SECRET
        remoteRef: { key: aegisdrive/production/jwt-refresh-secret }
      - secretKey: INTERNAL_SERVICE_TOKEN
        remoteRef: { key: aegisdrive/production/internal-service-token }
  ```

- A one-time `kubectl create secret generic aegisdrive-secrets --from-literal=...`
  run by a human (or a CI job with vault access) with the real values. Never
  committed, and never templated through `kustomize` — a secret that passes
  through a rendered YAML file on disk is a secret that can leak through a CI
  log or a `kubectl kustomize` debug run.

## Image tags and the release pipeline

`base/kustomization.yaml` pins every image to `:latest` only so `kubectl
kustomize k8s/base` renders something valid on its own. Neither overlay uses
that tag:

- **staging** tracks `:edge` — the image built from the latest commit on
  `main`. `.github/workflows/release.yml` pushes it and re-runs
  `kubectl apply -k k8s/overlays/staging` on every merge.
- **production** is pinned to `:unset` in the committed overlay so a stray
  `kubectl apply -k k8s/overlays/production` run outside the release workflow
  fails loudly instead of deploying an untagged image. The real deploy runs
  `kustomize edit set image ghcr.io/aegisdrive/api=ghcr.io/aegisdrive/api:$TAG`
  (one line per image) against a checkout of this overlay, immediately before
  `kubectl apply -k`, from a tagged release — see
  `.github/workflows/release.yml` and `docs/deployment.md`.

## Deploy order

Rolling the images is not the whole deploy. Follow
[`docs/runbook.md`'s deployment order](../docs/runbook.md#deployment-order):
migrations, then seed, then the API, then the workers, then the web bundle.
`kubectl apply -k` rolls every Deployment at once, so for a migration that is
not backwards-compatible with the currently running API, run `prisma migrate
deploy` as a one-off Job *before* applying the new manifests, not as part of
this same command.

## Network policy

`base/networkpolicy.yaml` default-denies all ingress and egress and then
opens exactly: ingress-controller → `api`/`web`, and `api`/every worker →
Postgres/Redis ports plus HTTPS egress (for the managed datastores, KMS, and
object storage, whose addresses this cluster does not control). See
`docs/security-hardening.md` for the full picture, including the
application-level controls this backs up.
