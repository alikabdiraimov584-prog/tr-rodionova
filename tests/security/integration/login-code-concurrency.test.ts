import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { consumeLoginCode, hashLoginCode } from "@/lib/login-code";

async function withLoginCode(run: (email: string) => Promise<void>) {
  const email = `security-login-${randomUUID()}@example.test`;
  try {
    await db.user.create({
      data: { email, passwordHash: "test-only-not-a-real-password-hash", firstName: "Security test" },
    });
    await db.loginCode.create({
      data: {
        email,
        codeHash: hashLoginCode(email, "123456"),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    await run(email);
  } finally {
    await db.loginCode.deleteMany({ where: { email } });
    await db.user.deleteMany({ where: { email } });
  }
}

test("concurrent requests can consume a one-time login code only once", async () => {
  await withLoginCode(async (email) => {
    const results = await Promise.all([
      consumeLoginCode(email, "123456"),
      consumeLoginCode(email, "123456"),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["expired", "ok"]);
    const row = await db.loginCode.findFirstOrThrow({ where: { email } });
    assert.ok(row.usedAt);
  });
});

test("concurrent invalid guesses cannot exceed the five-attempt limit", async () => {
  await withLoginCode(async (email) => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeLoginCode(email, "654321")));
    assert.equal(results.filter((r) => r.status === "invalid").length, 5);
    assert.equal(results.filter((r) => r.status === "expired").length, 3);
    const row = await db.loginCode.findFirstOrThrow({ where: { email } });
    assert.equal(row.attempts, 5);
  });
});

test.after(async () => {
  await db.$disconnect();
});
