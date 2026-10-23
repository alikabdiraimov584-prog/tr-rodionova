import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { checkRate, clearRate } from "@/lib/ratelimit";

// На настоящей базе: checkRate стоит перед входом, регистрацией и сбросом пароля. Ошибка в нём
// (например, запрос, ответ которого драйвер не умеет прочитать) ломает вход для всех.
test("checkRate counts attempts on a real database and locks after the limit", async () => {
  const key = `test:rate:${randomUUID()}`;
  try {
    for (let i = 0; i < 3; i++) assert.deepEqual(await checkRate(key, { limit: 3, windowSec: 60 }), { ok: true });
    const blocked = await checkRate(key, { limit: 3, windowSec: 60, lockSec: 120 });
    assert.equal(blocked.ok, false);
    await clearRate(key);
    assert.deepEqual(await checkRate(key, { limit: 3, windowSec: 60 }), { ok: true });
  } finally {
    await db.rateLimit.deleteMany({ where: { key } });
  }
});

test("concurrent checkRate calls for one key never exceed the limit", async () => {
  const key = `test:rate:${randomUUID()}`;
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => checkRate(key, { limit: 5, windowSec: 60 })));
    assert.equal(results.filter((r) => r.ok).length, 5);
  } finally {
    await db.rateLimit.deleteMany({ where: { key } });
  }
});
