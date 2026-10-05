#!/usr/bin/env bash
# Обновление без простоя: собрать новый образ, поднять новый контейнер web рядом со старым,
# дождаться готовности (/api/health), остановить старый. Caddy ходит на имя сервиса web, поэтому
# во время смены обслуживаются оба контейнера, а запросы к исчезнувшему контейнеру повторяются (lb_try_duration).
# Весь код в функции: файл заменяется git reset во время выполнения, bash не должен читать его построчно.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local prev
  prev=$(git rev-parse HEAD)
  git fetch origin main && git reset --hard origin/main
  export GIT_SHA BUILD_AT
  GIT_SHA=$(git rev-parse --short HEAD)
  BUILD_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  chmod 600 .env 2>/dev/null || true
  # постоянный ключ подписи серверных действий: без него каждая сборка меняет идентификаторы действий,
  # и кнопки в открытых до обновления вкладках CRM падают с «Раздел не открылся»
  if ! grep -q '^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' .env; then
    printf '\n# Ключ подписи серверных действий Next.js (постоянный, не менять)\nNEXT_SERVER_ACTIONS_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" >> .env
  fi
  export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' .env | tr -d '"\r' | head -1)
  docker compose build web

  local old new count status
  old=$(docker compose ps -q web || true)
  if [ -z "$old" ]; then
    # первый запуск или web остановлен: обычный старт
    docker compose up -d web cron backup
  else
    count=$(printf '%s\n' "$old" | wc -l)
    # новый контейнер из нового образа рядом со старым (--no-recreate не трогает работающий)
    docker compose up -d --no-deps --no-recreate --scale "web=$((count + 1))" web
    new=$(comm -13 <(printf '%s\n' "$old" | sort) <(docker compose ps -q web | sort))
    if [ -z "$new" ]; then echo "Новый контейнер не создан"; exit 1; fi
    status=starting
    for _ in $(seq 1 60); do
      status=$(docker inspect -f '{{.State.Health.Status}}' "$new" 2>/dev/null || echo starting)
      [ "$status" = healthy ] && break
      if [ "$status" = unhealthy ] || [ "$status" = exited ]; then break; fi
      sleep 5
    done
    if [ "$status" != healthy ]; then
      echo "Новый контейнер не поднялся (статус: $status), старый продолжает работать. Последние строки лога:"
      docker logs --tail 60 "$new" || true
      docker rm -f "$new" >/dev/null 2>&1 || true
      exit 1
    fi
    # старые контейнеры: мягкая остановка, Next.js завершает текущие запросы
    for c in $old; do
      docker stop -t 30 "$c" >/dev/null && docker rm "$c" >/dev/null
    done
    docker compose up -d --no-deps --no-recreate --scale web=1 web >/dev/null
    docker compose up -d --no-deps cron backup
  fi

  # Caddy: конфиг перечитывается без разрыва соединений, если он менялся
  if ! git diff --quiet "$prev" HEAD -- deploy/Caddyfile; then
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || docker compose restart caddy
  fi

  docker image prune -f >/dev/null
  echo "Обновлено: $(git log --oneline -1)"
}

main "$@"
