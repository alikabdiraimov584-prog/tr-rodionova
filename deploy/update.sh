#!/usr/bin/env bash
# Обновление приложения до последнего main: сборка нового образа, миграции при старте, перезапуск без простоя Caddy.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch origin main && git reset --hard origin/main
docker compose build web
docker compose up -d web cron
docker image prune -f >/dev/null
echo "Обновлено: $(git log --oneline -1)"
