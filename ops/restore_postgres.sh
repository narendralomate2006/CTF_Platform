#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then echo "Usage: $0 backup.dump" >&2; exit 2; fi
: "${PGHOST:=localhost}"; : "${PGPORT:=5432}"; : "${PGUSER:=ctf}"; : "${PGDATABASE:=ctf_platform}"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PGDATABASE" "$1"
echo "Restore completed from $1"
