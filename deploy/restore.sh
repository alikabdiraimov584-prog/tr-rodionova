#!/usr/bin/env bash
# Восстановление базы из дампа (pg_dump в gzip, как делает сервис backup).
#   sudo -u deploy bash deploy/restore.sh              — свежий дамп из тома backups
#   sudo -u deploy bash deploy/restore.sh ИМЯ.sql.gz   — конкретный дамп из тома (имя из списка)
#   sudo -u deploy bash deploy/restore.sh /путь/к/файлу.sql.gz — файл на диске (например, скачанный из S3)
#   добавьте --yes, чтобы не спрашивать подтверждение
# Порядок: страховочный дамп текущей базы в том backups → остановка web и cron → очистка схемы →
# загрузка дампа → старт web (миграции применяются при старте) → проверка /api/health.
# Сайт недоступен на время загрузки (обычно 1–2 минуты). Все шаги идут через образ postgres:16 сервиса backup,
# поэтому ни psql, ни доступ к базе с хоста не нужны.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local yes=0 arg="" mount=() src
  for a in "$@"; do
    case "$a" in --yes) yes=1 ;; *) arg="$a" ;; esac
  done
  local run=(docker compose run --rm --no-deps -T --entrypoint sh)

  if [ -z "$arg" ]; then
    src=$("${run[@]}" backup -c 'ls -1 /backups/*.sql.gz 2>/dev/null | sort | tail -1' | tr -d '\r' | tail -1)
    [ -n "$src" ] || { echo "В томе backups нет дампов. Укажите файл: deploy/restore.sh /путь/к/файлу.sql.gz"; exit 1; }
  elif [ -f "$arg" ]; then
    mount=(-v "$(realpath "$arg"):/restore.sql.gz:ro")
    src=/restore.sql.gz
  else
    src="/backups/$(basename "$arg")"
    "${run[@]}" backup -c "test -f '$src'" || { echo "В томе backups нет файла $src. Список: deploy/restore.sh --list"; exit 1; }
  fi
  if [ "$arg" = "--list" ]; then "${run[@]}" backup -c 'ls -lh /backups/*.sql.gz 2>/dev/null || echo "дампов нет"'; exit 0; fi

  echo "Дамп для восстановления: ${arg:-$src}"
  "${run[@]}" "${mount[@]}" backup -c "gunzip -t '$src'" || { echo "Файл повреждён или это не gzip"; exit 1; }
  if [ "$yes" != 1 ]; then
    read -r -p "Текущая база будет ЗАМЕНЕНА содержимым дампа (страховочная копия сохранится). Продолжить? [yes/нет] " ans
    [ "$ans" = "yes" ] || { echo "Отменено"; exit 1; }
  fi

  local stamp pre
  stamp=$(date -u +%Y%m%d-%H%M)
  pre="/backups/pre-restore-$stamp.sql.gz"
  echo "1/5 Страховочный дамп текущей базы: $pre"
  "${run[@]}" backup -c "pg_dump -Z 9 -f '$pre' \"\$DATABASE_URL\" && test -s '$pre'"

  echo "2/5 Останавливаю приложение (сайт временно недоступен)"
  docker compose stop -t 30 web cron >/dev/null

  echo "3/5 Очищаю схему и загружаю дамп"
  "${run[@]}" "${mount[@]}" backup -c "psql -q -v ON_ERROR_STOP=1 \"\$DATABASE_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && gunzip -c '$src' | psql -q -v ON_ERROR_STOP=1 \"\$DATABASE_URL\"" || {
    echo "Загрузка не удалась. База может быть пустой: верните страховочную копию командой deploy/restore.sh $(basename "$pre") --yes"
    exit 1
  }

  echo "4/5 Запускаю приложение"
  docker compose up -d web cron >/dev/null

  echo "5/5 Жду готовности"
  local ok=0
  for _ in $(seq 1 60); do
    if curl -sf -m 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1 || docker compose exec -T web node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok=1; break; fi
    sleep 5
  done
  if [ "$ok" = 1 ]; then
    echo "Готово: база восстановлена из ${arg:-$src}, сайт отвечает. Страховочная копия: $pre"
  else
    echo "Приложение не ответило за 5 минут. Последние строки лога:"; docker compose logs --tail 40 web || true
    exit 1
  fi
}

main "$@"
