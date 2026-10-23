#!/usr/bin/env bash
# Диагностика почты сайта: настройки канала Email (без пароля), соединение с SMTP, последние письма с причинами
# сбоев. С адресом — ещё и тестовое письмо. Ничего не меняет.
# Запуск: cd /opt/tr-rodionova && sudo -u deploy bash deploy/mail-check.sh [куда@прислать.тест]
set -euo pipefail
cd "$(dirname "$0")/.."
# web-образ без tsx, поэтому проверка выполняется в образе init (как reset-admin.sh)
docker compose run --rm --no-deps -T init node --conditions=react-server --import tsx scripts/mail-check.ts "${1:-}"
