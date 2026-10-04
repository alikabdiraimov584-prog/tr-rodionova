import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Шифрование секретов интеграций в базе (AES-256-GCM). Ключ выводится из AUTH_SECRET:
 * утечка дампа базы без секрета приложения не раскрывает токены провайдеров.
 */
const PREFIX = "enc:v1:";
let cached: Buffer | null = null;

function key() {
  if (cached) return cached;
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  cached = scryptSync(s, "tr-rodionova-integrations", 32);
  return cached;
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decryptSecret(value: string) {
  if (!value.startsWith(PREFIX)) return value; // незашифрованное значение (старые записи)
  const buf = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string) {
  return value.startsWith(PREFIX);
}
