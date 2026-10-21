import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/session";
import { acceptTotp, readPendingTwoFactor, signPendingTwoFactor } from "@/lib/two-factor";
import { generateTotpSecret, totpCode } from "@/lib/totp";
import { encryptSecret } from "@/lib/crypto";

test("the pending 2FA cookie value is rejected as a session cookie", async () => {
  const pending = await signPendingTwoFactor("user-1", "/crm");
  assert.equal(await decrypt(pending), null);
  assert.deepEqual(await readPendingTwoFactor(pending), { userId: "user-1", next: "/crm" });
});

test("a session token is rejected at the 2FA step", async () => {
  const session = await encrypt({ userId: "user-1", role: "SUPPORT", sv: 0, expiresAt: new Date().toISOString() }, 1);
  assert.ok(await decrypt(session));
  assert.equal(await readPendingTwoFactor(session), null);
});

test("a TOTP code is accepted once, then rejected as a replay", async () => {
  const userId = `totp-${randomUUID()}`;
  const plain = generateTotpSecret();
  const stored = encryptSecret(plain);
  const now = Date.now();
  const code = totpCode(plain, now);
  try {
    const results = await Promise.all([acceptTotp(userId, stored, code, now), acceptTotp(userId, stored, code, now)]);
    assert.deepEqual(results.sort(), [false, true]);
    // тот же код в соседнем окне (+30 с) — всё ещё тот же шаг, повтор отклоняется
    assert.equal(await acceptTotp(userId, stored, code, now + 30_000), false);
    assert.equal(await acceptTotp(userId, stored, "000000", now), false);
    // следующий код принимается
    assert.equal(await acceptTotp(userId, stored, totpCode(plain, now + 60_000), now + 60_000), true);
  } finally {
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `totp-used:${userId}:` } } });
  }
});
