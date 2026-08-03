# Logging

## What already exists

Every process — the API and all three background workers — logs structured
JSON to stdout via [pino](https://getpino.io), never to a file. This is
deliberate: a container's stdout is the one thing every runtime (Docker,
Kubernetes, a bare `systemd` unit) already captures without extra
configuration, and it is what makes the aggregation pipeline below possible
without touching application code.

- **Correlation.** `src/core/request-context.ts` generates a request id per
  HTTP request (`getRequestId()`) and `pino-http` (`src/app.ts`) attaches it to
  every log line emitted during that request, request and response included.
  Client-supplied `X-Request-Id` is honoured — see
  `src/middleware/request-context.middleware.ts` — so a single id can be
  grepped end-to-end from the browser's network tab through to the API's logs.
- **Redaction.** `packages/shared/src/logging/redact.ts` is the one list of
  paths (`Authorization` headers, cookies, passwords, refresh/access tokens,
  MFA secrets) that every logger — the API and every worker — redacts before a
  line is ever written. It is shared rather than repeated per process
  specifically so a worker cannot drift onto an older, incomplete copy of the
  policy; see that file's own comment for why this is a security control, not
  a style preference.
- **Levels.** `LOG_LEVEL` (`fatal` down to `trace`) is read from the
  environment by every process independently — see `apps/api/.env.example`
  and each worker's `src/config.ts`. Production runs at `info`; the staging
  overlay (`k8s/overlays/staging/config-patch.yaml`) turns it up to `debug`.
- **Pretty-printing.** `pino-pretty` renders logs for a human in local
  development (`isDevelopment` branch in `src/core/logger.ts`); every other
  environment gets raw JSON, because a log aggregator parses JSON and would
  otherwise have to un-parse pino-pretty's formatting first.

## What Phase 12 adds: aggregation

Structured stdout logs are necessary but not sufficient — without shipping
them somewhere searchable, "what happened to request `abc123` across the API
and the notifications worker" means SSH-ing into N containers and grepping
each one by hand. Two paths, matched to where you are running:

### Local development and CI: nothing to run

`pino-pretty` is enough for a single process on a laptop. Aggregation only
starts to matter once there is more than one process to correlate across,
which is the next case.

### Docker Compose (staging-like local runs)

```bash
docker compose -f infra/docker/docker-compose.yml --profile logging --profile full up -d
```

Starts Loki (`infra/monitoring/promtail/promtail-config.yml`'s target) and
Promtail, which discovers every container on the compose network through the
Docker socket and ships its stdout — no log-file paths to configure, no
per-service parsing rules, because every service already writes the same JSON
shape. Grafana (already provisioned for Prometheus metrics — see
`docs/deployment.md`) picks up the Loki datasource automatically from
`infra/monitoring/grafana/provisioning/datasources/loki.yml`. Query with
`{service="api"} | json | requestId="<id>"` in Grafana's Explore view to pull
every line for one request across every process that touched it.

### Kubernetes

Promtail (or Grafana Alloy, or Fluent Bit — whichever the cluster operator
already runs) is deployed as a **DaemonSet**, once per cluster, the same way
the ingress controller and cert-manager are — see `k8s/README.md`'s "what is
and is not here" section for why cluster-wide add-ons are not part of this
app's own manifests. It tails every pod's stdout from the node's container
runtime directly; nothing in `k8s/base` needs to change for a new Deployment
to be picked up; label selection is automatic. Point it at the same
aggregator (self-hosted Loki, or a managed one — CloudWatch Logs, Google Cloud
Logging, Datadog all speak this pattern too) and the query above works
identically, whether the API is running in Docker Compose or across 20
Kubernetes replicas.

## What this does not cover yet

- **Distributed tracing.** The request id threads logs together after the
  fact; it is not a trace with parent/child spans across the API → workers →
  `services/ai` boundary. OpenTelemetry is the natural next step if
  cross-service latency attribution becomes a real question, not before.
- **Evidence worker corruption events.** `services/evidence/src/index.ts`
  logs `EVIDENCE INTEGRITY FAILURE` at `error` level but has no counter a
  Prometheus alert can fire on (see the note at the bottom of
  `infra/monitoring/prometheus/alerts.yml`). Until that gap closes, log-based
  alerting (a Loki alert rule matching that string, or an aggregator's
  equivalent) is the only automated signal — do not assume the Prometheus
  alerts alone cover it.
- **`services/notifications/src/channels.ts`'s logging transport** writes the
  recipient's email or phone number to its log line at `info`, in every
  environment, because no real SMS/email/push provider is wired up yet (see
  that file's own comment). This is fine for delivery-support debugging in the
  same sense a mail server's delivery log is, but it is a real difference from
  the redacted-secrets policy above — a phone number is PII, and reaching for
  a real provider integration should also mean reconsidering whether it stays
  in the log line at `info` or moves to `debug`.
