#!/usr/bin/env bash
# Загрузка расходов запуска из таблицы владельца в CRM → Финансы (scripts/import-expenses.ts). Повторный запуск безопасен.
# Запуск: cd /opt/tr-rodionova && sudo -u deploy bash deploy/import-expenses.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# web-образ без tsx, поэтому скрипт выполняется в образе init (как reset-admin.sh)
docker compose run --rm --no-deps -T init npx tsx scripts/import-expenses.ts
