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
  $compose exec -T db psql -U coframe -d "$1" -Atc "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM projects), (SELECT count(*) FROM diagrams), (SELECT count(*) FROM diagram_versions)"
}
echo "live     users|projects|diagrams|versions: $(count coframe)"
echo "restored users|projects|diagrams|versions: $(count coframe_restore_check)"
$compose exec -T db dropdb -U coframe coframe_restore_check
