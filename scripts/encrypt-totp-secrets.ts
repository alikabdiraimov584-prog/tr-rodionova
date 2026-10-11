import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, isCurrentEncryption } from "@/lib/crypto";

/**
 * Idempotent migration for staff TOTP seeds. With ENCRYPTION_KEY configured, converts
 * plaintext and legacy AUTH_SECRET-derived enc:v1 values to independent-key enc:v2 values.
 * Without ENCRYPTION_KEY, preserves the existing backward-compatible v1 behavior.
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
    if (!value || isCurrentEncryption(value) || (!process.env.ENCRYPTION_KEY && value.startsWith("enc:v1:"))) {
      skipped++;
      continue;
    }
    const result = await db.user.updateMany({
      where: { id: user.id, totpSecret: value },
      data: { totpSecret: encryptSecret(decryptSecret(value)) },
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
