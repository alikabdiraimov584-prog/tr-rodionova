#!/usr/bin/env bash
# Восстановление входа администратора, когда пароль забыт или потерян телефон с 2FA.
# Запуск: cd /opt/tr-rodionova && sudo -u deploy bash deploy/reset-admin.sh [email]
# Без email берётся ADMIN_EMAIL из .env. Новый пароль вводится с клавиатуры (не сохраняется в .env и истории).
# Аккаунт становится администратором, 2FA и все его сессии сбрасываются; если email нет в базе — создаётся.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local email="${1:-}" pass pass2
  [ -n "$email" ] || email=$(sed -n 's/^ADMIN_EMAIL=//p' .env | tr -d '"\r' | head -n 1)
  if [ -z "$email" ]; then
    echo "Укажите email: sudo -u deploy bash deploy/reset-admin.sh имя@почта.ru"
    exit 1
  fi
  echo "Аккаунт: $email"
  read -r -s -p "Новый пароль (не короче 12 символов): " pass; echo
  read -r -s -p "Повторите пароль: " pass2; echo
  if [ "$pass" != "$pass2" ]; then echo "Пароли не совпали, ничего не изменено."; exit 1; fi
  if [ "${#pass}" -lt 12 ]; then echo "Пароль короче 12 символов, ничего не изменено."; exit 1; fi
  # web-образ без tsx, поэтому скрипт выполняется в образе init (в нём миграции и сиды)
  ADMIN_EMAIL="$email" ADMIN_PASSWORD="$pass" docker compose run --rm --no-deps -T \
    -e ADMIN_EMAIL -e ADMIN_PASSWORD init npx tsx scripts/reset-admin.ts
  echo "Готово: войдите на /login с этим email и новым паролем, затем заново включите 2FA в CRM → «Безопасность входа»."
}

main "$@"
