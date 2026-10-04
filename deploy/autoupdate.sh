#!/usr/bin/env bash
# Автообновление без SSH-ключей в GitHub: раз в 10 минут проверяет main и при новых коммитах запускает update.sh.
# Ставится install.sh в crontab пользователя deploy. Лог: /home/deploy/autoupdate.log
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/tr-autoupdate.lock
flock -n 9 || exit 0
git fetch -q origin main
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "$(date -u +%FT%TZ) обновление $LOCAL → $REMOTE"
bash deploy/update.sh
