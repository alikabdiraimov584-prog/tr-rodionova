import { db } from "@/lib/db";
import { encryptSecret, isEncrypted } from "@/lib/crypto";

/**
 * One-time, idempotent migration for existing staff TOTP seeds.
 * Run on the new app container after old app containers have stopped:
 * node --conditions=react-server --import tsx scripts/encrypt-totp-secrets.ts
 */
async function main() {
  const users = await db.user.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });
  let migrated = 0;
  let skipped = 0;
  for (const user of users) {
    const value = user.totpSecret;
    if (!value || isEncrypted(value)) {
      skipped++;
      continue;
    }
    const result = await db.user.updateMany({
      where: { id: user.id, totpSecret: value },
      data: { totpSecret: encryptSecret(value) },
    });
    migrated += result.count;
  }
  console.info(`TOTP secret migration complete: encrypted=${migrated}, unchanged=${skipped}`);
}

main()
  .catch((error) => {
    console.error("TOTP secret migration failed");
    console.error(error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
