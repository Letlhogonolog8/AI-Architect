-- Run once against the real database by someone with sufficient privilege
-- (not part of the Prisma migration history in apps/api/prisma/migrations:
-- that history is owned by the application's own migration role, which
-- normally cannot and should not read pg_shadow).
--
-- This is what lets pgbouncer.ini's `auth_query` validate a client's password
-- without PgBouncer ever holding its own copy — no userlist.txt, nothing to
-- regenerate when the real password rotates.
CREATE OR REPLACE FUNCTION public.pgbouncer_auth_lookup(in_username text)
RETURNS TABLE (usename text, passwd text) AS $$
BEGIN
  RETURN QUERY
    SELECT pg_shadow.usename, pg_shadow.passwd
    FROM pg_shadow
    WHERE pg_shadow.usename = in_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.pgbouncer_auth_lookup(text) FROM PUBLIC;

-- A dedicated low-privilege role for PgBouncer to connect to Postgres as when
-- running the auth_query — not the application's own migration or runtime
-- role, and granted nothing beyond executing this one function.
CREATE ROLE pgbouncer_auth WITH LOGIN PASSWORD 'set-a-real-password-here';
GRANT EXECUTE ON FUNCTION public.pgbouncer_auth_lookup(text) TO pgbouncer_auth;

-- Managed Postgres note: RDS and most managed providers do not grant even a
-- superuser-equivalent role access to pg_shadow (see
-- docs/postgres-optimization.md). This script only works against a
-- self-hosted Postgres. On a managed provider, use that provider's own
-- pooler (RDS Proxy, Cloud SQL's built-in pooling, Aiven's PgBouncer add-on)
-- instead of self-hosted PgBouncer.
