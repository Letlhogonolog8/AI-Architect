# AEGISDRIVE AI VPOS — Complete System Integration Audit

**Date:** 2026-08-03
**Scope:** Full read-only inspection across 5 parallel deep-dives (frontend, mobile, AI/decision-flow, backend, database) plus targeted checks (project structure, auth, realtime, evidence, security, performance, code quality). No code was changed to produce this report. Every claim is traceable to a specific file.

> Note: this repository's local folder path contains "HealthAiAssist" for unrelated historical reasons — the application itself is **AEGISDRIVE AI**, a Vehicle Protection Operating System (VPOS), not a health-assistant product.

---

## PHASE 1 — Project Structure Audit

**Folders:** `apps/{api,web,mobile}`, `services/{ai,evidence,notifications,telemetry}`, `packages/{shared,types,ui}`, `lib/{db,api-client-react,api-zod,api-spec}`, `artifacts/*`, `docs`, `infra`, `k8s`, `scripts`. `apps/mobile` is deliberately outside the pnpm workspace (ADR-0003).

**Real findings:**

| Finding | Evidence | Severity |
|---|---|---|
| `lib/db` (`@workspace/db`, Drizzle-based) has zero consumers anywhere in `apps`/`packages`/`services` | `grep -rl "@workspace/db"` → no hits; ADR-0002 confirms "two ORMs coexist during the transition" but the transition finished — everything now uses Prisma | Minor (dead code, safe to delete) |
| `lib/api-client-react`, `lib/api-zod`, `lib/api-spec` (`@workspace/*`) also have zero consumers | Same grep pattern, zero hits; `apps/web/package.json` depends only on `@aegisdrive/*` | Minor |
| `pnpm-workspace.yaml` lists `lib/integrations/*` as a package glob — directory doesn't exist | `find lib/integrations` → no such directory | Trivial (dead config) |
| `@replit/connectors-sdk` in root `package.json` dependencies has zero usages | `grep -rl` across whole repo → no hits | Minor |
| `artifacts/*` (api-server, command-center, mockup-sandbox) is the legacy Replit prototype, already correctly excluded from CI typecheck/build per ADR-0001 | `.github/workflows/ci.yml` comments confirm this is known and intentional | None — already handled |
| No circular dependencies found among TS project references (`packages/types` → `packages/shared` → `packages/ui`, `lib/db`, `lib/api-client-react`, `lib/api-zod`) | `tsc --build` (root `typecheck:libs`) builds clean — a cycle would fail this outright | None |
| No ESLint config anywhere in the platform (`apps/api`, `apps/web`, `packages/*`, `services/*`) | No `.eslintrc`/`eslint.config.*` found; only `apps/mobile/package.json` has a `lint` script (`expo lint`) | Moderate — see Phase 14 |
| `tsconfig.base.json` sets `noUnusedLocals: false` and has no `noUnusedParameters` | Direct read of the file | Moderate — nothing catches dead variables/imports platform-wide |
| Environment variables: every app has a matching `.env.example` (root, api, web, mobile) and validates at boot via Zod; no `.env` file is committed | `git ls-files` confirms no committed `.env` | None — correct |
| TypeScript config is deliberately cherry-picked strict flags, not blanket `"strict": true` (`strictFunctionTypes: false` explicitly) | `tsconfig.base.json` | Informational, not a bug |

**Verdict:** mostly clean. The only real action item is deleting four confirmed-dead `@workspace/*` packages and the stale `lib/integrations/*` glob entry — low risk, no dependents.

---

## PHASE 2 — Frontend Audit (apps/web, 14 pages)

| Page | Verdict | Note |
|---|---|---|
| DashboardPage | CONNECTED | Delegates to Command Centre widget grid + Socket.IO; explicit "Simulation" badge when `VITE_DATA_SOURCE=mock` |
| VehiclesPage / VehicleDetailPage | CONNECTED | Real `useQuery` + `QueryState` (loading/error/retry) |
| DriversPage | CONNECTED | Same pattern |
| IncidentsPage / IncidentDetailPage | CONNECTED | Same pattern |
| AnalyticsPage, UsersPage, RolesPage, AuditLogsPage | CONNECTED | Same pattern, permission-gated via `Can`/`RequirePermission` |
| FleetPage | NOT CONNECTED | `PlaceholderPage` — self-documents its own required endpoints (`ws /realtime → vehicle:position`, `/threat-events/zones`), blocked on Mapbox (ADR-0004) |
| EvidencePage | NOT CONNECTED | `PlaceholderPage`, despite `apps/web/src/data/live-source.ts` already implementing `getRecentEvidence()` — the data layer is ready, the page just isn't wired to it |
| ThreatIntelligencePage | NOT CONNECTED | `PlaceholderPage` |
| SettingsPage | PARTIALLY CONNECTED | Real query for `/organization` inside an otherwise placeholder shell |

**Routing/nav:** all 14 pages reachable, lazy-loaded, guarded by `RequirePermission` matching real permission strings. Sidebar collapses empty sections rather than showing dead links.

**Realtime client:** `realtime/socket-driver.ts` connects to the same `REALTIME_NAMESPACE` constant the backend uses (shared from `@aegisdrive/types`) — type-safe, not string-matched.

**Cross-cutting:** no `dark:` Tailwind classes found anywhere — this is a single-theme app, not light/dark togglable.

---

## PHASE 3 — Backend Audit (21 modules)

**Structural findings (apply uniformly, zero exceptions across all 21 modules):**
- Every route: `authenticate` + explicit `requirePermissions`/`requireRoles`. Zero unguarded routes.
- Every mutating route: `validate({ body/params/query })`. No exceptions.
- Rate limiting: `authRateLimit` on login/refresh; `ingestRateLimit` on telemetry/behaviour/cabin/identity device ingest; global `rateLimit()` everywhere else.
- Layering: zero `prisma.` calls inside any controller — controller → service → repository respected everywhere.
- Pagination: the shared `normalisePagination`/`toSkipTake`/`paginate` trio used in 16/21 modules; the other 5 (roles, organizations, telemetry, health, dashboard) correctly don't need it.

**Real finding — caching used in only 2 of 21 modules, `invalidate()` used in zero:**
`cached()` appears only in `dashboard.service.ts` and `recovery.service.ts`. `invalidate()` (`cache/redis.ts`) has zero call sites anywhere in `apps/api/src/modules`. Both caches rely entirely on TTL expiry — a case-status change won't be visible to an operator until the TTL lapses, not immediately.

**Real finding — 8 of 21 backend modules have no confirmed frontend caller:**
`behaviour`, `cabin`, `corridor`, `decisions`, `recovery`, `sos`, `telemetry`, `threat-events` all have complete, permission-guarded, validated backend APIs with no caller anywhere in `apps/web/src`. This is the single largest integration gap in the system — the backend is materially ahead of the frontend.

**Verdict:** every module is internally CONNECTED (routes→controller→service→repo); the gap is entirely at the frontend-integration layer, not inside the backend itself.

---

## PHASE 4 — Database Audit

Clean bill of health. 44 models, zero orphans (every model relates to something, or is deliberately global reference data with nullable `organizationId` — `ThreatZone`, `RoadSegment`, `SegmentHazard`, both documented as intentional in their own model comments). Spot-checked 9 highest-traffic models (Vehicle, Incident, Telemetry, ThreatEvent, ThreatDecision, Evidence, AuditLog, SosActivation, RecoveryCase) — all correctly indexed for their evident query shapes.

Migration history verified byte-for-byte: all 44 `@@map()` table names in `schema.prisma` match all 44 `CREATE TABLE` statements across the 4 migrations — zero drift, schema is not ahead of what's migrated.

`seed.ts` does slightly more than `docs/runbook.md` describes (also bootstraps an admin org+user outside production, gated on `SEED_ADMIN_PASSWORD`) — a documentation-precision nit, not a bug.

**No schema or migration changes recommended.**

---

## PHASE 5 — Authentication

Full surface present and correct: login, refresh, logout, logout-all, `/me`, session list, session revoke — all in `auth.routes.ts`. `authenticate.middleware.ts` re-reads the principal from the database on every request (cached, bounded TTL) rather than trusting the token wholesale, so a suspension or role change takes effect on the next request, not at token expiry. Cross-tenant token reuse after an org move is explicitly rejected. All 6 roles (ADMIN, OPERATOR, SECURITY, POLICE, DRIVER, ANALYST) are seeded from the same single source of truth (`ROLE_PERMISSIONS`) that the API enforces against — no drift possible between what's seeded and what's enforced.

One security finding (see Phase 12): `jwt.verify()` calls don't pin an explicit `algorithms` allow-list.

**Verdict: CONNECTED, no integration gaps.**

---

## PHASE 6 — Real-Time Engine

15 emit functions in `realtime/emitter.ts`; 14 have confirmed callers from the relevant service. One dead export: `emitFleetSnapshot` has zero callers anywhere — the fleet snapshot the dashboard uses is served over cached REST polling, not pushed live, despite the live-push function existing for it. `setRealtimeServer` correctly wired once at boot.

**Verdict: PARTIALLY CONNECTED** — real-time works for vehicle position, incidents, alerts, threats, behaviour, SOS, dispatch, and recovery; fleet-snapshot push is unwired.

---

## PHASE 7 — Command Centre

Dashboard shell is real and live-data-driven, but Tactical Map (FleetPage) and camera/threat-intelligence widgets sit behind explicit placeholders, not live backend data. The widgets that are wired (AI Decision Console, Live Camera Grid, Driver Confidence, Notification Dispatch, Responder Assets — all under `components/widgets/`) exist as real components, but three of the named Command Centre surfaces (Tactical Map, Evidence Vault, Threat Intelligence) are not live.

---

## PHASE 8 — Mobile Application

| Capability | Verdict |
|---|---|
| Authentication | CONNECTED |
| Vehicle status | CONNECTED |
| **SafeCorridor** | **BROKEN — confirmed 404 + 403.** Calls `GET /corridors` (backend mounts `/corridor`, real paths are `/corridor/plans`, `/corridor/havens/nearest`). Even fixed, `/threat-events/zones` requires `threat:read`, which `DRIVER_PERMISSIONS` does not grant. |
| **Silent SOS / panic button** | **CRITICAL — bypasses the purpose-built engine entirely.** `panic.ts`/`sync.ts` post to `POST /incidents`, not the dedicated `POST /sos/activations` (which the driver role already holds `sos:activate` for, specifically designed to return a neutral 202 "nothing comes back to the cabin" receipt). Zero references to `/sos` anywhere in mobile source. |
| Evidence upload | PARTIALLY CONNECTED — metadata registers (`POST /evidence`), byte upload never implemented on either side (consistent with the backend's own known gap) |
| Push notifications | NOT CONNECTED — `expo-notifications` installed, zero imports anywhere |
| Emergency contacts | NOT CONNECTED — 100% local SQLite; backend only has a single contact field per driver, a schema mismatch even if wired |
| Voice trigger | Honest stub — explicitly reports unavailability (no wake-word module in managed Expo), not faked |
| Offline mode | CONNECTED, best-built subsystem — real priority outbox queue, SOS drains first, correct retry/permanent-failure handling |
| Device fingerprinting | CONNECTED |

**This is the most safety-critical finding in the entire audit: the mobile panic button does not trigger the Silent SOS system.**

---

## PHASE 9 — AI Engine Audit & PHASE 10 — System Data Flow

`services/ai` (Python gateway) is still not integrated — no Dockerfile, `AI_SERVICE_URL` unset. `decision.routes.ts`'s own comment confirms the architecture assumes this gateway will call the pipeline; it doesn't exist yet, so every stage below is exercised only by direct API calls today.

| Engine | Confidence score? | Read downstream? |
|---|---|---|
| Continuous Identity | Yes (LLR fusion) | No — `decision.service.ts` hardcodes `identityConfidence: null` even though the field exists for it |
| Behaviour Intelligence | Yes | Yes, but only by itself (see below) |
| Cabin Intelligence | Yes (weapon verdict) | No — `ContextualEvidence` exists in `DecideInput` specifically for cabin signals; `runDecision` never populates it |
| Threat Decision Engine | Yes (posteriors) | Yes for incident-opening only |
| SafeCorridor | Implicit | No incident/decision linkage at all |
| Recovery Mesh | N/A | Standalone, no incident linkage |
| Evidence | N/A (integrity) | Reads incidents only when building an export bundle on request |

**The requested incident chain, arrow by arrow:**

```
Driver enters vehicle → Identity verified        EXISTS BUT NOT AUTOMATIC (no trigger on vehicle entry)
Identity verified → Behaviour analysed           EXISTS BUT PARTIAL (identity is caller-supplied, not fetched)
Behaviour analysed → Cabin analysed              MISSING (parallel inputs, not sequential)
Cabin analysed → Threat detected                 EXISTS, but bypasses the Decision Engine entirely
Threat detected → Threat Decision Engine         EXISTS BUT NOT AUTOMATIC, AND CABIN-BLIND
Threat Decision Engine → SafeCorridor            MISSING (no shared import either direction)
SafeCorridor → Police notified                   MISSING
Police/Security notified                         MISSING as an automatic step anywhere on the incident path
Evidence encrypted                               MISSING as a trigger (manual seal only)
Recovery Mesh armed                              MISSING (no incident-repository import in recovery.service.ts)
Incident closed                                  EXISTS BUT NOT AUTOMATIC
```

**The single most important finding in this entire audit:** there is no orchestration layer anywhere. Every module is independently correct and independently callable, but nothing wires "assessment created" into the next stage automatically. Worse — **two competing incident-creation paths exist with no reconciliation**: the "official" Threat Decision Engine (manual, rarely invoked, cabin-blind) and `behaviour.service.ts`'s own `applyResponse` policy, which calls `raiseAlert`/`createIncident` directly, bypassing the Decision Engine completely. An operator can see two different incidents/severities for the same real-world event depending on which code path happened to fire. And "Police/Security notified" has no implementation on the incident path at all; only the separate, driver-initiated SOS flow dispatches externally (and per Phase 8, the mobile app doesn't even call that).

---

## PHASE 11 — Evidence Vault

API surface is genuinely comprehensive: list, register, seal, verify (recompute digest + replay custody chain), single-artefact export, multi-artefact court-export bundles, timeline replay, signer-status. All routes authenticated + permission-gated; static routes correctly ordered before `:evidenceId` to avoid Express path-matching bugs. `EvidenceType` covers VIDEO/AUDIO/IMAGE/TELEMETRY_SNAPSHOT (GPS)/DOCUMENT/AI_INFERENCE/SYSTEM_LOG.

Encryption (envelope, per-artefact), SHA-256 manifest digest, and the tamper-evident custody hash chain are all real and were unit-tested in the prior deployment phase. Digital signatures are honestly `UNSIGNED` until an HSM/KMS signer is registered — `GET /signer` reports this truthfully rather than faking a signature (deliberate, documented design, not a gap).

**Confirmed known gap (not new):** the actual object-store byte upload/download is not built (`computeStoredChecksum` throws by design). Combined with Phase 8/10 findings: no incident automatically triggers a seal, and mobile never uploads bytes — so today, the Evidence Vault has real cryptographic/custody machinery but zero actual media flowing through it end-to-end.

---

## PHASE 12 — Security Audit

| Area | Finding |
|---|---|
| JWT | Separate access/refresh secrets (enforced distinct in production by env validation), `typ` claim double-checked, issuer/audience checked. **Gap:** `jwt.verify()` doesn't pin `algorithms: ['HS256']` explicitly — not currently exploitable (no RSA keys in the system), but a best-practice gap and cheap to close. |
| Secrets | No `.env` committed; gitleaks scans full git history in CI; JWT/DB/Redis secrets validated at boot, never logged (shared redaction list across API + all 3 workers). |
| Passwords | bcrypt, configurable cost (12 default). |
| HTTPS/HSTS | Enforced at ingress + app layer; web origin now also sends HSTS. |
| Rate limiting | Global + auth-specific + ingest-specific, fails open on Redis loss (deliberate, documented). |
| CORS | Allow-list only, wildcard rejected in production by env schema. |
| SQL injection | Zero raw-SQL string interpolation found; the only 2 `$queryRaw` call sites use tagged templates (parameterized), both safe. |
| XSS | Zero `dangerouslySetInnerHTML` anywhere in web or mobile source. |
| CSRF | Refresh-token cookie is `httpOnly`, `secure` (prod), `sameSite: lax` — adequate given every other route uses a bearer token (not ambient cookie auth). |
| Authorization | Zero unguarded routes across all 21 backend modules. |

**Verdict:** strong baseline; one real, low-effort fix (JWT algorithm pinning).

---

## PHASE 13 — Performance Audit

Largely already addressed in the prior production-deployment work in this session: response compression, `keepAliveTimeout`/`headersTimeout` tuning to avoid ingress 502s, HPA autoscaling, PgBouncer connection pooling, always-on slow-query logging, comprehensive indexing (Phase 4), frontend code-splitting, minified/bundled backend (esbuild). No N+1 query patterns found anywhere in `apps/api/src/modules`. No new performance bottlenecks surfaced.

---

## PHASE 14 — Code Quality

- No ESLint anywhere except `apps/mobile`. The main platform (api/web/packages/services) has no linting at all.
- `noUnusedLocals`/`noUnusedParameters` both off in `tsconfig.base.json` — dead variables/imports aren't caught by TypeScript either.
- No files are alarmingly large; largest is `TacticalMapWidget.tsx` at 408 lines (borderline, not critical).
- Architecture is otherwise disciplined: consistent controller→service→repository layering, a single shared RBAC source of truth, a single shared logging-redaction policy — genuine DRY practice.

**Clearest quality gap: add ESLint (`@typescript-eslint`, `eslint-plugin-react-hooks` for web) and turn on `noUnusedLocals`/`noUnusedParameters`.**

---

## PHASE 15 — Integration Matrix

| Module/Capability | Backend | Frontend (web) | Mobile | AI/Decision | DB |
|---|---|---|---|---|---|
| Auth/RBAC | Connected | Connected | Connected | — | OK |
| Vehicles/Fleet | Connected | Connected | Connected | — | OK |
| Tactical Map / live fleet positions | Connected | Not connected (placeholder) | — | — | OK |
| Drivers | Connected | Connected | — | — | OK |
| Incidents | Connected | Connected | Wrong endpoint used for panic | Two competing creation paths | OK |
| Evidence Vault (metadata/crypto/custody) | Connected | Not connected (placeholder despite ready data layer) | Metadata only, no byte upload | — | OK |
| Evidence Vault (object storage bytes) | Not built | N/A | Not built | — | — |
| Threat Intelligence | Connected | Not connected (placeholder) | Driver lacks threat:read | Cabin signal never reaches decision engine | OK |
| Behaviour Intelligence | Connected | No caller found | — | Own competing incident path | OK |
| Cabin Intelligence | Connected | No caller found | — | Never reaches Decision Engine | OK |
| Threat Decision Engine | Connected | No caller found | — | Manual trigger only, cabin-blind, identity-confidence dropped | OK |
| SafeCorridor | Connected | No caller found | Broken (wrong path + missing permission) | No link to Decision Engine | OK |
| Silent SOS | Connected (dedicated neutral-receipt design) | No caller found | Bypassed entirely by panic button | — | OK |
| Recovery Mesh | Connected | No caller found | — | No incident linkage | OK |
| Notifications (police/security dispatch) | Send-only wired; no automatic trigger from incidents | Send-only | — | Nothing calls it from the incident path | OK |
| Realtime (Socket.IO) | Connected (14/15 emitters used) | Connected | — | — | — |
| Caching/invalidation | Used in 2/21 modules, invalidate() never called | — | — | — | — |

---

## PHASE 16 — Visual System Map

```
┌─────────────┐        ┌──────────────┐        ┌───────────────────┐
│   Web App   │───────▶│   Backend    │───────▶│     Database       │
│ (14 pages,  │◀───────│  (21 modules,│◀───────│  (44 models, clean) │
│ 3 placehldr)│  REST   │ all guarded) │ Prisma │                     │
└─────────────┘  +WS    └──────┬───────┘        └────────────────────┘
                                │
              ┌─────────────────┼─────────────────────────────┐
              ▼                 ▼                             ▼
      ┌───────────────┐  ┌─────────────┐              ┌───────────────┐
      │  AI Engines   │  │  Realtime   │              │  Evidence     │
      │ Identity      │  │  Socket.IO  │              │  Vault        │
      │ Behaviour ────┼─▶│  (14/15     │              │  (crypto OK,  │
      │ Cabin    ─ ─ ─┤  │  emitters   │              │  bytes MISSING)│
      │ (cabin never  │  │  wired)     │              └───────┬───────┘
      │  reaches ▼)   │  └─────────────┘                      │
      └───────┬───────┘                                       │
              │ (manual only)                                 │ (manual seal only)
              ▼                                                │
      ┌───────────────┐        ┌─────────────┐                │
      │Threat Decision│─ ─ ─ ─▶│ SafeCorridor│ (MISSING link) │
      │    Engine     │  X     └──────┬──────┘                │
      │ (cabin-blind, │               │ X (no link)           │
      │ manual trig)  │               ▼                       │
      └───────┬───────┘        ┌─────────────┐                │
              │ X (no link)     │Police/Sec.  │◀── X nothing   │
              ▼                │ Notification│    calls this  │
      ┌───────────────┐        │ (send-only) │    from here   │
      │  Incidents    │        └─────────────┘                │
      │ (2 competing  │                                       │
      │  creators)    │        ┌─────────────┐                │
      └───────┬───────┘  X     │Recovery Mesh│◀───────────────┘
              │ (no link)      │ (standalone)│  X (no link)
              └───────────────▶└─────────────┘

┌─────────────┐   REST/WS   ┌──────────────┐
│ Mobile App  │────────────▶│   Backend    │
│ Auth OK     │             │  (as above)  │
│ Offline OK  │             └──────────────┘
│ SafeCorridor│  X 404/403 (wrong path, missing permission)
│ Panic/SOS   │  X posts to /incidents, NOT /sos/activations
│ Evidence    │  Metadata only, no byte upload
│ Push notif  │  X not implemented
│ Contacts    │  X local-only, schema mismatch with backend
└─────────────┘

services/ai (Python) ─ ─ ─ X not integrated, no Dockerfile, unreachable
```

Solid lines = confirmed working connections. Dashed/X = the requested pipeline that does not actually exist in code today.

---

## PHASE 17 — Final Report

### Completion & readiness

| Metric | Score | Basis |
|---|---|---|
| Overall completion | ~68% | Every module exists and is internally correct; the AI→Decision→Response pipeline and 3 Command Centre surfaces are the largest gaps |
| System readiness (as a working demo) | Good | Auth, CRUD, dashboard, realtime, mobile auth/offline all genuinely work |
| Production readiness | Not ready | Silent SOS bypass and the missing incident-orchestration layer are launch-blocking for a safety product |
| Architecture score | 8/10 | Disciplined layering, single sources of truth for RBAC/logging/pagination; loses points for the missing orchestration layer |
| Security score | 8/10 | No unguarded routes, no injection/XSS found, correct crypto; loses points for JWT algorithms pinning gap |
| Performance score | 8/10 | Already hardened in the prior deployment phase; no new bottlenecks found |
| Scalability score | 8/10 | HPA, PgBouncer, caching pattern exists — but cache invalidation gap will bite under real write load |
| Code quality score | 6/10 | Good architecture, but zero linting platform-wide and noUnusedLocals off |
| AI readiness score | 4/10 | Every engine works in isolation with real confidence scoring; none of them are wired into an automatic pipeline, and two engines compete to create incidents |
| Deployment readiness score | 9/10 | Covered exhaustively in the prior production-deployment work this session — genuinely strong |

### Critical issues (launch-blocking)

1. Mobile panic button never triggers Silent SOS — posts to `/incidents` instead of `/sos/activations`. No neutral-receipt cover, no automatic dispatch fan-out, for the platform's core safety promise.
2. No automatic incident-response orchestration exists anywhere. Threat detection → Decision Engine → SafeCorridor → Police/Security notification → Evidence seal → Recovery arm is entirely manual, arrow by arrow.
3. Two competing incident-creation paths (Behaviour's own policy vs. the Threat Decision Engine) with no reconciliation.
4. Cabin Intelligence never reaches the Threat Decision Engine, despite a purpose-built input for exactly this existing and being unused.
5. Mobile SafeCorridor is fully broken (wrong endpoint path + missing driver permission).

### Medium issues

6. Evidence Vault has no real byte storage end-to-end (known, already documented gap — not new).
7. Cache invalidation never called anywhere (`invalidate()` — 0 call sites); stale reads possible.
8. 8 of 21 backend modules (behaviour, cabin, corridor, decisions, recovery, sos, telemetry, threat-events) have no web frontend caller at all.
9. `EvidencePage`/`FleetPage`/`ThreatIntelligencePage` are placeholders in the web app.
10. Mobile push notifications and emergency-contact sync are unimplemented.
11. JWT `algorithms` allow-list not pinned on verify.

### Minor issues / technical debt

12. Four dead `@workspace/*` packages (`lib/db`, `lib/api-client-react`, `lib/api-zod`, `lib/api-spec`) and one dead workspace glob (`lib/integrations/*`).
13. One unused root dependency (`@replit/connectors-sdk`).
14. `emitFleetSnapshot` dead export.
15. No ESLint anywhere except mobile; `noUnusedLocals`/`noUnusedParameters` off.
16. `docs/runbook.md`'s one-line description of `seed.ts` understates what it does.

### Prioritized action plan

| Priority | Action | Est. effort |
|---|---|---|
| P0 | Fix mobile panic button to call `POST /sos/activations` instead of `/incidents` | Small |
| P0 | Fix mobile SafeCorridor endpoint path (`/corridors` → `/corridor/plans`) and grant DRIVER a scoped `threat:read`-equivalent for hotspot zones | Small |
| P1 | Wire an orchestration step: behaviour/cabin detection → automatically invoke `runDecision` with `context` populated from cabin evidence, and reconcile with `behaviour.service.ts`'s own incident-creation policy so there's one funnel, not two | Medium-large |
| P1 | Add an automatic hand-off from Decision Engine output → SafeCorridor calculation → notification dispatch → evidence seal → recovery arm (or explicitly document human-in-the-loop by design) | Medium-large |
| P2 | Wire `EvidencePage`, `FleetPage`, `ThreatIntelligencePage` to their already-built backend APIs | Medium |
| P2 | Add `invalidate()` calls after writes in `dashboard.service.ts`/`recovery.service.ts` | Small |
| P2 | Pin `algorithms: ['HS256']` on both `jwt.verify()` calls | Trivial |
| P3 | Add ESLint + `noUnusedLocals`/`noUnusedParameters` platform-wide | Medium |
| P3 | Delete confirmed-dead `@workspace/*` packages, `lib/integrations/*` glob, `@replit/connectors-sdk`, `emitFleetSnapshot` | Small |

---

**No code was modified to produce this report.** Given how safety-critical items 1–2 are, implementation should be confirmed explicitly before touching that code.
