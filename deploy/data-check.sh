#!/usr/bin/env bash
# Проверка боевой базы только на чтение: демо-данные, настоящие заказы и визиты, сотрудники. Ничего не меняет.
# Запуск: cd /opt/tr-rodionova && sudo -u deploy bash deploy/data-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# web-образ без tsx, поэтому скрипт выполняется в образе init (как reset-admin.sh)
docker compose run --rm --no-deps -T init npx tsx scripts/data-check.ts
