import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Серверное действие можно вызвать POST-запросом с любого адреса, мимо proxy, поэтому права
 * проверяются внутри каждого действия. Тест ловит новое экспортированное действие без проверки.
 */
const DIR = path.join(process.cwd(), "src", "app", "actions");

// Помощники, которые сами проверяют вход и права (или владельца записи).
const GUARDS = /\b(requireSection|requireUser|requireStaff|requireAdmin|getCurrentUser|getCurrentCustomer|ownOrder|ownCard)\(/;

// Публичные действия: гостевая корзина и оформление, вход, регистрация, восстановление пароля, ввод кода 2FA.
// Каждое из них обязано само ограничивать перебор или работать только с данными гостя.
const PUBLIC = new Set([
  "auth.ts:loginAction",
  "auth.ts:registerAction",
  "auth.ts:logoutAction",
  "auth.ts:requestLoginCodeAction",
  "auth.ts:verifyLoginCodeAction",
  "password-reset.ts:requestPasswordResetAction",
  "password-reset.ts:resetPasswordAction",
  "shop.ts:addToCartAction",
  "shop.ts:updateCartAction",
  "shop.ts:checkoutAction",
  "shop.ts:quoteAction",
  "shop.ts:suggestAddressAction",
  "totp.ts:verifyTwoFactorAction",
]);

function exportedActions(file: string) {
  const src = readFileSync(path.join(DIR, file), "utf8");
  const starts = [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => ({ name: m[1], at: m.index! }));
  return starts.map((s, i) => {
    // тело — до следующего объявления верхнего уровня
    const rest = src.slice(s.at + 1, i + 1 < starts.length ? starts[i + 1].at : undefined);
    const end = rest.search(/^(?:export |async function |function |const |type )/m);
    return { name: s.name, body: end === -1 ? rest : rest.slice(0, end) };
  });
}

test("every exported server action checks authorization or is explicitly public", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length > 10, "actions directory found");
  const unguarded: string[] = [];
  const seenPublic = new Set<string>();
  for (const file of files) {
    for (const { name, body } of exportedActions(file)) {
      const id = `${file}:${name}`;
      if (PUBLIC.has(id)) {
        seenPublic.add(id);
        continue;
      }
      if (!GUARDS.test(body)) unguarded.push(id);
    }
  }
  assert.deepEqual(unguarded, [], `actions without an authorization check: ${unguarded.join(", ")}`);
  // устаревшие записи в списке публичных действий тоже ошибка: список должен быть точным
  assert.deepEqual([...PUBLIC].filter((id) => !seenPublic.has(id)), []);
});

test("rate limits guard the public authentication actions", () => {
  const auth = readFileSync(path.join(DIR, "auth.ts"), "utf8");
  for (const name of ["loginAction", "registerAction", "requestLoginCodeAction", "verifyLoginCodeAction"]) {
    const body = exportedActions("auth.ts").find((a) => a.name === name)?.body ?? "";
    assert.match(body, /checkRate\(/, `${name} must be rate limited`);
  }
  assert.ok(auth.includes("verifyPasswordOrDummy"), "login keeps constant-time account lookup");
  const totp = exportedActions("totp.ts").find((a) => a.name === "verifyTwoFactorAction")?.body ?? "";
  assert.match(totp, /checkRate\(/);
  assert.match(totp, /readPendingTwoFactor\(/, "2FA step accepts only a pending-2FA token");
  assert.match(totp, /acceptTotp\(/, "2FA step rejects replayed codes");
});
