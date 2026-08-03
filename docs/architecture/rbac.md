# Authorisation model

## Two mechanisms, one source of truth

**Roles** are groupings. **Permissions** are the unit of authorisation. Routes
gate on permissions, not roles, because gating on a role hard-codes today's
grouping into every handler and makes the policy impossible to change without
touching the whole codebase.

`ROLE_PERMISSIONS` in `packages/shared/src/rbac/role-permissions.ts` is the
single source of truth. It is:

- Seeded into the `roles` table by `apps/api/prisma/seed.ts`, which runs on
  **every** deployment including production and is idempotent.
- Enforced per route by `requirePermissions` in the API.
- Used by the web client only to hide affordances.

That last point matters: **the client's permission checks are UX, not
security.** A user who edits their local storage to walk past a route guard
reaches a page whose every request returns 403 and writes a
`PERMISSION_DENIED` audit entry.

## Permission vocabulary

Permissions are `<resource>:<action>` strings, declared as a closed union in
`packages/types/src/auth.ts`. A typo in a route guard is a compile error rather
than a silent authorisation bypass.

## The six roles

| Role       | Who they are              | The line they cannot cross                             |
| ---------- | ------------------------- | ------------------------------------------------------ |
| `ADMIN`    | Tenant administrator      | — (holds every permission)                             |
| `OPERATOR` | Control-room operator     | No `vehicle:immobilise`, no user or role management    |
| `SECURITY` | Armed response            | No user, role or fleet management                      |
| `POLICE`   | Law-enforcement liaison   | Read and evidence export only; no operational mutation |
| `DRIVER`   | Vehicle driver, on mobile | Own vehicle and incidents only                         |
| `ANALYST`  | Risk and intelligence     | Broad read + threat curation; no operational action    |

### Why `OPERATOR` does not hold `vehicle:immobilise`

Remote immobilisation stops a moving vehicle. Done wrongly — wrong vehicle,
misread situation — it can kill someone. It is separated from the day-to-day
monitoring role so that using it is a deliberate escalation to a
security-trained principal, not one more button on a busy operator's screen.

### Why `POLICE` is read-and-export only

An external principal must never be able to mutate operational state. They get
`evidence:export`, which is audited with a mandatory recipient and written
reason, and `incident:update` so they can attach case detail — nothing that
changes the protection posture of a vehicle.

### Why `DRIVER` permissions look broader than they are

`DRIVER` holds `vehicle:read` and `incident:read`, which open the routes. The
query layer scopes results to that driver's own vehicle and incidents.
Permissions open doors; the repository decides which rows are behind them.

## Roles are global, not per tenant

The `roles` table is not tenant-scoped and there is **no API to create or edit a
role**. Tenants differ in who holds which role, not in what the roles mean.

A tenant that could invent a role could invent one holding `evidence:purge`.
The Roles page in the web client is therefore read-only by design — changing
what a role can do is a change to `ROLE_PERMISSIONS`, reviewed, versioned and
deployed.

## Adding a permission

1. Add the string to `PERMISSIONS` in `packages/types/src/auth.ts`.
2. Grant it to the appropriate roles in `role-permissions.ts`.
3. Apply it in the route with `requirePermissions('resource:action')`.
4. Add it to a nav item's `permission` in `apps/web/src/config/navigation.ts`
   if it gates a screen.
5. Deploy — the seed reconciles the `roles` table automatically.

Steps 1–3 are compile-checked end to end. There is no step where a permission
exists in one place but not another and the build still passes.

## Session revocation

Access tokens live 15 minutes; that window is bounded deliberately rather than
relied upon. Two mechanisms close it:

- `authenticate` re-reads the principal from the database on every request
  (cached for 5 minutes, invalidated explicitly on role or status change), so a
  suspension or role change takes effect almost immediately.
- Suspending a user, resetting their password or signing out everywhere revokes
  every `Session` row, which kills refresh immediately.

Refresh tokens are single-use. Presenting an already-revoked one is treated as
compromise: **every** session for that user is destroyed and the event is
audited. See `apps/api/src/modules/auth/auth.service.ts`.
