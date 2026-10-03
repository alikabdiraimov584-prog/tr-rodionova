#!/bin/sh
# Старт в продакшене: применить миграции, при пустой базе — засеять, затем запустить Next.js.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-1}" = "1" ]; then
  npx tsx scripts/seed-if-empty.ts
fi
exec npx next start -p "${PORT:-3000}"
