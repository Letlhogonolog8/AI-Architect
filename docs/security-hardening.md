# Security hardening

Most of the platform's security posture already existed before this document
did — this is an index of where each control lives and why, plus the small
set of gaps Phase 12 actually closed. It is not a from-scratch design.

## Already in place (application layer)

| Control                     | Where                                                                                                                 | Note                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup-time env validation | `apps/api/src/config/env.ts`                                                                                          | Refuses to boot on a bad config rather than failing mid-request; production-only checks (distinct JWT secrets, no wildcard CORS) — see `apps/api/src/config/env.test.ts` |
| CORS allow-list             | `apps/api/src/middleware/security.middleware.ts`                                                                      | Wildcard rejected in production by the env schema above                                                                                                                  |
| Security headers (API)      | same file, via `helmet`                                                                                               | CSP deliberately left to the web origin — see that file's own comment                                                                                                    |
| Security headers (web)      | `apps/web/nginx.conf`                                                                                                 | CSP, `X-Frame-Options`, `Permissions-Policy`, and now HSTS (this phase — see below)                                                                                      |
| Rate limiting               | `apps/api/src/middleware/rate-limit.middleware.ts`                                                                    | Fails open on Redis loss; per-user or per-IP; tighter budgets for auth and looser for telemetry ingest                                                                   |
| RBAC                        | `packages/shared/src/rbac`, tested in `authorize.test.ts` (this phase)                                                | Single source of truth for the permission matrix — see that file's own comment                                                                                           |
| Tenant isolation            | `belongsToOrganization` (`packages/shared/src/rbac/authorize.ts`) + every repository query scoped by `organizationId` |                                                                                                                                                                          |
| Password hashing            | `bcryptjs`, `BCRYPT_ROUNDS` env-tunable                                                                               |                                                                                                                                                                          |
| JWT                         | Separate access/refresh secrets, refresh token single-use and rotating                                                | `docs/runbook.md`'s "Operators are logged out unpredictably" explains the replay-detection behaviour                                                                     |
| Refresh token cookie        | `httpOnly`, `secure` in production, `sameSite: lax`                                                                   | `apps/api/src/modules/auth/auth.controller.ts`                                                                                                                           |
| Audit log                   | `AuditLog` model + `/api/v1/audit-logs`                                                                               | Used in `docs/runbook.md`'s incident-response section                                                                                                                    |
| Evidence integrity          | Envelope encryption + tamper-evident custody hash chain                                                               | `packages/shared/src/evidence/verify.ts`, tested in `verify.test.ts` (this phase)                                                                                        |
| Dependency audit            | `.github/workflows/security.yml`'s `audit` job                                                                        | Weekly + on every push; high/critical blocks                                                                                                                             |
| Secret scanning             | Same workflow's `secrets` job (gitleaks), full git history                                                            |                                                                                                                                                                          |

## Added this phase

- **HSTS on the web origin** (`apps/web/nginx.conf`). The API already set it
  conditionally on `isProduction`; nginx had no equivalent. Added
  unconditionally rather than gated, because Chrome and Firefox both
  special-case `localhost` to never enforce HSTS — see the file's own
  comment for why this is safe for `docker compose --profile full`.
- **Container image scanning** (`.github/workflows/ci.yml`'s `docker` job, via
  Trivy). Every image this platform ships — API, web, all three workers, and
  the new backup image — is now scanned for HIGH/CRITICAL CVEs in its base
  image and OS packages as part of the build, before the release workflow
  ever has a chance to push it.
- **CodeQL static analysis** (`.github/workflows/security.yml`'s new `codeql`
  job), covering both the TypeScript/JavaScript workspace and `services/ai`.
  Runs on every push and PR to `main`, same as the existing audit and secret
  scan jobs.
- **Dependabot** (`.github/dependabot.yml`), covering npm, pip
  (`services/ai`), the three Dockerfiles, and GitHub Actions themselves.
  Grouped weekly PRs rather than one-per-package/immediate — the existing
  `audit` job finds that a dependency is vulnerable; Dependabot is what
  actually opens the PR that bumps it, closing the loop.
- **Kubernetes NetworkPolicies** (`k8s/base/networkpolicy.yaml`) — default
  deny, with explicit allows for ingress-controller → api/web, monitoring
  namespace → api's `/metrics`, and api/workers → the datastore ports plus
  HTTPS egress. See `k8s/README.md`.
- **Pod Security Standards** (`k8s/base/namespace.yaml`,
  `pod-security.kubernetes.io/enforce: restricted`) — cluster-enforced,
  independent of whether a manifest's own `securityContext` is later edited
  or a new one is added without copying it. Every Deployment and CronJob in
  `k8s/base` already runs as non-root, drops every capability, refuses
  privilege escalation and sets `seccompProfile: RuntimeDefault`, which is
  exactly what `restricted` requires — this label is what makes that a
  cluster-enforced floor instead of a per-manifest convention someone could
  quietly drop.
- **Ingress-level rate limiting** (`k8s/base/ingress.yaml`,
  `nginx.ingress.kubernetes.io/limit-rps`) — defense in depth on top of the
  application-level limiter, stopping a flood before it reaches a pod at all
  rather than after.

## Known gaps, stated rather than papered over

- **`services/notifications/src/channels.ts`'s logging transport** writes
  recipient email/phone to its log line because no real SMS/email/push
  provider is wired up yet. See `docs/logging.md`'s "what this does not cover
  yet" section — this is a product-integration gap, not something a
  deployment-infrastructure pass can close on its own.
- **The evidence object-store integration is not built** — see
  `docs/architecture/evidence-chain-of-custody.md`'s "Not built yet" and
  `docs/backup-restore.md`'s note on why there is nothing to back up there
  yet. Object-lock/WORM and bucket versioning are both prerequisites of that
  future work, not gaps in what exists today.
- **No distributed tracing.** `docs/logging.md` covers what correlation
  exists today (the request id) and what it does not (cross-service span
  attribution).
