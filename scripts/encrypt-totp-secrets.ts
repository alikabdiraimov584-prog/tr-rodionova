import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, isCurrentEncryption } from "@/lib/crypto";
import { byKey } from "@/lib/integrations/registry";
import { CHANNEL_FIELDS } from "@/lib/support/channels";
import type { Channel } from "@/generated/prisma/enums";

/**
 * Idempotent encryption-key migration.
 *
 * Without ENCRYPTION_KEY this leaves already-encrypted v1 values unchanged and keeps
 * legacy behavior. With ENCRYPTION_KEY configured, it re-encrypts TOTP, integration,
 * and support-channel secrets to enc:v2. Run only after all active app instances understand
 * enc:v2; keep AUTH_SECRET unchanged until the migration completes successfully.
 */
async function migrateUserTotp() {
  const users = await db.user.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });
  let migrated = 0;
  for (const user of users) {
    const value = user.totpSecret;
    if (!value || isCurrentEncryption(value) || (!process.env.ENCRYPTION_KEY && value.startsWith("enc:v1:"))) continue;
    const result = await db.user.updateMany({
      where: { id: user.id, totpSecret: value },
      data: { totpSecret: encryptSecret(decryptSecret(value)) },
    });
    migrated += result.count;
  }
  return migrated;
}

async function migrateIntegrationSecrets() {
  const rows = await db.integration.findMany();
  let migrated = 0;
  for (const row of rows) {
    const definition = byKey.get(row.key);
    if (!definition) continue;
    const config = (row.config as Record<string, unknown> | null) ?? {};
    const next = { ...config };
    let changed = false;
    for (const field of definition.fields) {
      if (!field.secret) continue;
      const value = config[field.key];
      if (typeof value !== "string" || isCurrentEncryption(value)) continue;
      if (!process.env.ENCRYPTION_KEY && value.startsWith("enc:v1:")) continue;
      next[field.key] = encryptSecret(decryptSecret(value));
      changed = true;
    }
    if (changed) {
      const result = await db.integration.updateMany({
        where: { key: row.key, updatedAt: row.updatedAt },
        data: { config: next as never },
      });
      migrated += result.count;
    }
  }
  return migrated;
}

async function migrateChannelSecrets() {
  const rows = await db.channelIntegration.findMany();
  let migrated = 0;
  for (const row of rows) {
    const fields = CHANNEL_FIELDS[row.channel as Exclude<Channel, "WEBSITE">] ?? [];
    const secretKeys = new Set(fields.filter((field) => field.secret).map((field) => field.key));
    const config = (row.config as Record<string, unknown> | null) ?? {};
    const next = { ...config };
    let changed = false;
    for (const key of secretKeys) {
      const value = config[key];
      if (typeof value !== "string" || isCurrentEncryption(value)) continue;
      if (!process.env.ENCRYPTION_KEY && value.startsWith("enc:v1:")) continue;
      next[key] = encryptSecret(decryptSecret(value));
      changed = true;
    }
    if (changed) {
      const result = await db.channelIntegration.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt },
        data: { config: next as never },
      });
      migrated += result.count;
    }
  }
  return migrated;
}

async function main() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error("ENCRYPTION_KEY must contain at least 32 characters");
  }
  const [totp, integrations, channels] = await Promise.all([
    migrateUserTotp(),
    migrateIntegrationSecrets(),
    migrateChannelSecrets(),
  ]);
  console.info(`Encryption migration complete: totp=${totp}, integrations=${integrations}, channels=${channels}`);
}

main()
  .catch((error) => {
    console.error("Encryption migration failed");
    console.error(error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
