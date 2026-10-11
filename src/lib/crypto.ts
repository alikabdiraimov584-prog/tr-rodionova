import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Secrets at rest use AES-256-GCM. ENCRYPTION_KEY is independent from AUTH_SECRET,
 * so rotating session-signing keys does not destroy access to stored integration/TOTP secrets.
 *
 * Compatibility:
 * - enc:v1 values were derived from AUTH_SECRET before the independent key existed.
 * - enc:v2 values use ENCRYPTION_KEY.
 * - if ENCRYPTION_KEY is not configured yet, writes remain v1 to avoid silently
 *   changing deployment requirements; configure it and run the re-encryption script before
 *   rotating AUTH_SECRET.
 */
const LEGACY_PREFIX = "enc:v1:";
const PREFIX = "enc:v2:";
let cachedV1: Buffer | null = null;
let cachedV2: Buffer | null = null;

function derive(secret: string, salt: string) {
  return scryptSync(secret, salt, 32);
}

function legacyKey() {
  if (cachedV1) return cachedV1;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  cachedV1 = derive(secret, "tr-rodionova-integrations");
  return cachedV1;
}

function currentKey() {
  if (cachedV2) return cachedV2;
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("ENCRYPTION_KEY не задан или короче 32 символов");
  cachedV2 = derive(secret, "tr-rodionova-integrations-v2");
  return cachedV2;
}

function seal(plain: string, key: Buffer, prefix: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return prefix + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

function open(value: string, prefix: string, key: Buffer) {
  const buf = Buffer.from(value.slice(prefix.length), "base64url");
  if (buf.length < 28) throw new Error("Некорректный зашифрованный секрет");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptSecret(plain: string) {
  // Keep writing v1 during rolling deploys. Activate v2 only after every running
  // instance understands v2 and the operator deliberately enables the migration.
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY_ACTIVE === "1") return seal(plain, currentKey(), PREFIX);
  return seal(plain, legacyKey(), LEGACY_PREFIX);
}

export function decryptSecret(value: string) {
  if (value.startsWith(PREFIX)) return open(value, PREFIX, currentKey());
  if (value.startsWith(LEGACY_PREFIX)) return open(value, LEGACY_PREFIX, legacyKey());
  return value; // plaintext legacy records are supported only until the migration completes
}

export function isEncrypted(value: string) {
  return value.startsWith(LEGACY_PREFIX) || value.startsWith(PREFIX);
}

export function isCurrentEncryption(value: string) {
  return value.startsWith(PREFIX);
}
