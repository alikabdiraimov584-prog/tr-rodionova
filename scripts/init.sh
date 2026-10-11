#!/bin/sh
# Short-lived release task: migrate the database and apply idempotent seed/bootstrap scripts.
# This image has build/deployment tooling and must not receive public traffic.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-0}" = "1" ]; then
  npx tsx scripts/seed-if-empty.ts
else
  npx tsx scripts/bootstrap-admin.ts
fi
npx tsx scripts/seed-brand.ts
npx tsx scripts/attach-brand-photos.ts
npx tsx scripts/seed-journal.ts || echo "journal seed skipped"
npx tsx scripts/seed-campaigns.ts || echo "campaigns seed skipped"
