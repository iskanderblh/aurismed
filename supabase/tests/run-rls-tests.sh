#!/usr/bin/env bash
# Lance la migration et les tests RLS sur un PostgreSQL local jetable.
# Usage : PG_BIN=/usr/lib/postgresql/16/bin ./supabase/tests/run-rls-tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="$(mktemp -d)"
PORT="${PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUN_AS=(su postgres -s /bin/bash -c); fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
run "$PG_BIN/initdb -D $DATA -A trust -U postgres >/dev/null"
run "$PG_BIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log start >/dev/null"
trap 'run "$PG_BIN/pg_ctl -D $DATA stop -m immediate >/dev/null"; rm -rf "$DATA"' EXIT
PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/rls_test.sql
