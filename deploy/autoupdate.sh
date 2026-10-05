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
# тревога владельцу в Telegram (CRM → Интеграции → «Тревоги в Telegram»), если обновление не прошло; старая версия продолжает работать
notify() {
  local url secret
  url=$(sed -n 's/^APP_URL=//p' .env | tr -d '"\r' | head -1); secret=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d '"\r' | head -1)
  [ -n "$url" ] && [ -n "$secret" ] || return 0
  curl -s -m 20 -o /dev/null -X POST "$url/api/ops/alert" -H "Authorization: Bearer $secret" --data-urlencode "text=$1" --data-urlencode "key=autoupdate" || true
}
if ! bash deploy/update.sh; then
  echo "$(date -u +%FT%TZ) обновление не удалось"
  notify "автообновление не прошло (${LOCAL:0:7} → ${REMOTE:0:7}); сайт работает на прежней версии. Лог: /home/deploy/autoupdate.log, команда: cd /opt/tr-rodionova && sudo -u deploy bash deploy/update.sh"
  exit 1
fi
