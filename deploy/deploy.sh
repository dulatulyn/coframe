#!/usr/bin/env bash
set -euo pipefail

host="${DEPLOY_HOST:?set DEPLOY_HOST}"
user="${DEPLOY_USER:-nousrussel}"
key="${DEPLOY_KEY:-}"
ref="${DEPLOY_REF:-HEAD}"
url="${DEPLOY_URL:-}"

ssh_opts=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30)
if [ -n "$key" ]; then
  ssh_opts+=(-i "$key" -o IdentitiesOnly=yes)
fi
target="$user@$host"

cd "$(git rev-parse --show-toplevel)"
echo "deploying $(git rev-parse --short "$ref") to $target"

git archive --format=tar "$ref" | ssh "${ssh_opts[@]}" "$target" '
  set -e
  mkdir -p ~/coframe
  rm -rf ~/coframe/src.next
  mkdir ~/coframe/src.next
  tar -x -C ~/coframe/src.next
  rm -rf ~/coframe/src
  mv ~/coframe/src.next ~/coframe/src
'

ssh "${ssh_opts[@]}" "$target" '
  set -e
  cd ~/coframe
  test -f .env || { echo "~/coframe/.env is missing" >&2; exit 1; }
  compose="docker compose --env-file .env -f src/deploy/compose.yml"
  docker builder prune -af >/dev/null
  for service in api web caddy; do
    $compose build "$service"
    docker builder prune -af >/dev/null
  done
  $compose up -d --remove-orphans
  docker image prune -f >/dev/null
  $compose ps
  df -h / | tail -1
'

if [ -n "$url" ]; then
  for attempt in $(seq 1 30); do
    if curl -fsS "$url/api/health" >/dev/null 2>&1 && curl -fsS -o /dev/null "$url/"; then
      echo "healthy: $url"
      exit 0
    fi
    sleep 5
  done
  echo "not healthy after deploy: $url" >&2
  exit 1
fi
