import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** TOTP (RFC 6238) на node:crypto, без внешних библиотек. Совместимо с Google Authenticator, Яндекс Ключ, 1Password. */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Принимает текущий код и соседние окна (±30 с) на случай рассинхрона часов. */
export function verifyTotp(secret: string, input: string, time = Date.now()) {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 6) return false;
  for (const delta of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secret, time + delta * 30_000));
    if (timingSafeEqual(expected, Buffer.from(digits))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, account: string, issuer = "T.Rodionova CRM") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
