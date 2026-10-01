#!/usr/bin/env bash
set -euo pipefail

cd ~/coframe
latest=$(ls -1t backups/coframe-*.dump 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  echo "no backups in ~/coframe/backups" >&2
  exit 1
fi
echo "checking $latest ($(du -h "$latest" | cut -f1))"
compose="docker compose --env-file .env -f src/deploy/compose.yml"
$compose exec -T db dropdb -U coframe --if-exists coframe_restore_check
$compose exec -T db createdb -U coframe coframe_restore_check
$compose exec -T db pg_restore -U coframe -d coframe_restore_check --no-owner < "$latest"
count() {
  $compose exec -T db psql -U coframe -d "$1" -Atc "SELECT string_agg(t || '=' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || t, false, true, '')))[1]::text, ' ' ORDER BY t) FROM unnest(ARRAY['users', 'workspaces', 'projects', 'folders', 'diagrams', 'diagram_versions']) AS t WHERE to_regclass(t) IS NOT NULL"
}
echo "live:     $(count coframe)"
echo "restored: $(count coframe_restore_check)"
$compose exec -T db dropdb -U coframe coframe_restore_check
