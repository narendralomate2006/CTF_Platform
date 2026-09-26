#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=ctf}"
: "${PGDATABASE:=ctf_platform}"
: "${BACKUP_DIR:=./backups}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/ctf_platform_${STAMP}.dump"
pg_dump --format=custom --no-owner --no-acl --file="$OUT"
# Keep the newest 14 backups.
find "$BACKUP_DIR" -type f -name 'ctf_platform_*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +15 | cut -d' ' -f2- | xargs -r rm -f
printf 'Backup written to %s\n' "$OUT"
