#!/bin/sh
# Creates or reconciles the least-privileged database login used by the API.
# The production Compose database-role job executes this on every deployment.
set -eu

if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  echo "POSTGRES_APP_PASSWORD is required" >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=db_name="$POSTGRES_DB" \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE windels_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windels_app') \gexec

-- Keep the configured secret authoritative when a database is initialized from
-- a volume snapshot that already contains the role.
SELECT format('ALTER ROLE windels_app PASSWORD %L', :'app_password') \gexec

GRANT CONNECT ON DATABASE :"db_name" TO windels_app;
GRANT USAGE ON SCHEMA public TO windels_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO windels_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO windels_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO windels_app;

-- Prisma migrations run as POSTGRES_USER. These defaults grant access to every
-- table/sequence/function that that owner creates now or in future upgrades.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO windels_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO windels_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO windels_app;
SQL
