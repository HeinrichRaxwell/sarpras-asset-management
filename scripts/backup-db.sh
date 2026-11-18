#!/bin/sh
# Backup harian PostgreSQL SARPRAS. Jalankan via cron/Task Scheduler:
#   0 2 * * *  cd /path/to/repo && docker compose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB' > backups/sarpras_$(date +\%F).sql
# Atau langsung: sh scripts/backup-db.sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/sarpras_$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping database..."
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip > "$OUT"

SIZE=$(wc -c < "$OUT")
if [ "$SIZE" -lt 100 ]; then
  echo "[backup] GAGAL: output hanya $SIZE byte" >&2
  rm -f "$OUT"
  exit 1
fi

echo "[backup] OK: $OUT ($SIZE byte)"

echo "[backup] hapus backup lebih dari $RETENTION_DAYS hari..."
find "$BACKUP_DIR" -name 'sarpras_*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

echo "[backup] selesai. Total: $(find "$BACKUP_DIR" -name 'sarpras_*.sql.gz' | wc -l) file"
