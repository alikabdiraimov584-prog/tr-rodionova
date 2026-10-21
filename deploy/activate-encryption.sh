#!/usr/bin/env bash
# Второй этап перехода на независимый ключ шифрования (docs/DEPLOY.md → «Независимый ключ шифрования секретов»).
# Запуск один раз: cd /opt/tr-rodionova && sudo -u deploy bash deploy/activate-encryption.sh
# Что делает: проверяет ENCRYPTION_KEY (его создаёт update.sh), снимает дамп базы, включает ENCRYPTION_KEY_ACTIVE=1
# и запускает update.sh. Тот обновляет сайт в режиме обслуживания (около минуты без ответа) и перешифровывает
# ключи интеграций, каналов и 2FA новым ключом. Повторный запуск безопасен.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local key auth
  key=$(sed -n 's/^ENCRYPTION_KEY=//p' .env | tr -d '"\r' | head -n 1)
  auth=$(sed -n 's/^AUTH_SECRET=//p' .env | tr -d '"\r' | head -n 1)
  if [ "${#key}" -lt 32 ]; then
    echo "ENCRYPTION_KEY ещё не создан: сначала выполните обычное обновление (deploy/update.sh), затем повторите."
    exit 1
  fi
  if [ "$key" = "$auth" ]; then
    echo "ENCRYPTION_KEY совпадает с AUTH_SECRET — так нельзя. Остановлено, ничего не изменено."
    exit 1
  fi
  # приложение должно уже работать с этим ключом в окружении (иначе старый процесс не прочтёт enc:v2)
  if ! docker compose exec -T web node -e 'process.exit(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32 ? 0 : 1)' 2>/dev/null; then
    echo "Работающий сайт запущен без ENCRYPTION_KEY: выполните deploy/update.sh, дождитесь «Обновлено», затем повторите."
    exit 1
  fi

  echo "== Резервная копия базы перед перешифровкой"
  bash deploy/backup.sh

  if grep -q '^ENCRYPTION_KEY_ACTIVE=' .env; then
    sed -i 's/^ENCRYPTION_KEY_ACTIVE=.*/ENCRYPTION_KEY_ACTIVE=1/' .env
  else
    printf '\n# Новые секреты шифруются ENCRYPTION_KEY (включено deploy/activate-encryption.sh)\nENCRYPTION_KEY_ACTIVE=1\n' >> .env
  fi

  echo "== Обновление в режиме обслуживания и перешифровка секретов"
  bash deploy/update.sh
  echo "Готово: в логе выше должна быть строка «Encryption migration complete». Проверьте вход с 2FA, почту и интеграции в CRM."
}

main "$@"
