#!/bin/sh
# Старт в продакшене: применить миграции, при пустой базе — засеять, затем запустить Next.js.
set -e
npx prisma migrate deploy
# Демо-данные (с известными паролями) — только для стенда: SEED_ON_START=1. В проде создаётся
# один администратор из ADMIN_EMAIL / ADMIN_PASSWORD.
if [ "${SEED_ON_START:-0}" = "1" ]; then
  npx tsx scripts/seed-if-empty.ts
else
  npx tsx scripts/bootstrap-admin.ts
fi
# Вещи бренда и их фото обновляются при каждом старте (идемпотентно)
npx tsx scripts/seed-brand.ts && npx tsx scripts/attach-brand-photos.ts
exec npx next start -p "${PORT:-3000}"
