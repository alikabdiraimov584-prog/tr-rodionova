#!/usr/bin/env bash
# Автообновление без SSH-ключей в GitHub: раз в 10 минут проверяет main и при новых коммитах запускает update.sh.
# Проверяем не только локальный Git HEAD, но и реально работающий commit: update.sh может успеть
# выполнить git reset, а затем завершиться ошибкой до запуска новой версии.
# Ставится install.sh в crontab пользователя deploy. Лог: /home/deploy/autoupdate.log
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/tr-autoupdate.lock
flock -n 9 || exit 0
git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

deployed_commit() {
  local url body commit
  url=$(sed -n 's/^APP_URL=//p' .env 2>/dev/null | tr -d '"\r' | head -1)
  if [ -n "$url" ]; then
    body=$(curl -fsS --max-time 10 "${url%/}/api/version" 2>/dev/null || true)
    commit=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit", ""))' 2>/dev/null || true)
    if [ -n "$commit" ] && [ "$commit" != "unknown" ]; then
      printf '%s' "$commit"
      return 0
    fi
  fi
  # Fallback if the public endpoint is temporarily unavailable.
  timeout 10 docker compose exec -T web node -e 'process.stdout.write(process.env.GIT_SHA || "")' 2>/dev/null || true
}

DEPLOYED=$(deployed_commit || true)
if [ "$LOCAL" = "$REMOTE" ] && [ -n "$DEPLOYED" ] && [ "${DEPLOYED:0:7}" = "${REMOTE:0:7}" ]; then
  exit 0
fi

echo "$(date -u +%FT%TZ) обновление: local=$LOCAL remote=$REMOTE deployed=${DEPLOYED:-unknown}"
# тревога владельцу в Telegram (CRM → Интеграции → «Тревоги в Telegram»), если обновление не прошло.
notify() {
  local url secret
  url=$(sed -n 's/^APP_URL=//p' .env | tr -d '"\r' | head -1)
  secret=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d '"\r' | head -1)
  [ -n "$url" ] && [ -n "$secret" ] || return 0
  curl -s -m 20 -o /dev/null -X POST "$url/api/ops/alert" -H "Authorization: Bearer $secret" --data-urlencode "text=$1" --data-urlencode "key=autoupdate" || true
}
if ! bash deploy/update.sh; then
  echo "$(date -u +%FT%TZ) обновление не удалось; следующая cron-попытка повторит проверку работающего commit"
  notify "автообновление не прошло (${LOCAL:0:7} → ${REMOTE:0:7}); сайт работает на прежней версии. Лог: /home/deploy/autoupdate.log, команда: cd /opt/tr-rodionova && sudo -u deploy bash deploy/update.sh"
  exit 1
fi
