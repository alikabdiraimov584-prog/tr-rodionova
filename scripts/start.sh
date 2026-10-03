#!/bin/sh
# Старт в продакшене: применить миграции, при пустой базе — засеять, затем запустить Next.js.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-1}" = "1" ]; then
  npx tsx scripts/seed-if-empty.ts
fi
# Вещи бренда и их фото обновляются при каждом старте (идемпотентно)
npx tsx scripts/seed-brand.ts && npx tsx scripts/attach-brand-photos.ts
exec npx next start -p "${PORT:-3000}"
