#!/usr/bin/env bash
set -euo pipefail

host="${DEPLOY_HOST:?set DEPLOY_HOST}"
user="${DEPLOY_USER:-nousrussel}"
key="${DEPLOY_KEY:-}"
target="${1:-backups}"

ssh_opts=(-o StrictHostKeyChecking=accept-new)
if [ -n "$key" ]; then
  ssh_opts+=(-i "$key" -o IdentitiesOnly=yes)
fi

mkdir -p "$target"
rsync -az -e "ssh ${ssh_opts[*]}" "$user@$host:coframe/backups/" "$target/"
ls -1t "$target" | head -5
