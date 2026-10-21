import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, jwtVerify } from "jose";
import { isPendingTwoFactorClaims, isSessionClaims, PENDING_2FA_PURPOSE } from "../../src/lib/token-claims";

const key = new TextEncoder().encode("test-only-secret-that-is-at-least-32-characters");
const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(key);
const read = async (token: string) => (await jwtVerify(token, key, { algorithms: ["HS256"] })).payload;

test("a regular session token is accepted as a session", async () => {
  const payload = await read(await sign({ userId: "u1", role: "SUPPORT", sv: 0, expiresAt: new Date().toISOString(), tf: true }));
  assert.equal(isSessionClaims(payload), true);
  assert.equal(isPendingTwoFactorClaims(payload), false);
});

test("a pending second-factor token cannot be used as a session", async () => {
  const payload = await read(await sign({ userId: "u1", next: "/crm", purpose: PENDING_2FA_PURPOSE }));
  assert.equal(isSessionClaims(payload), false);
  assert.equal(isPendingTwoFactorClaims(payload), true);
});

test("legacy pending tokens without a purpose are neither sessions nor pending tokens", async () => {
  const payload = await read(await sign({ userId: "u1", next: "/crm" }));
  assert.equal(isSessionClaims(payload), false);
  assert.equal(isPendingTwoFactorClaims(payload), false);
});

test("session claims require a known role and an integer session version", () => {
  assert.equal(isSessionClaims({ userId: "u1", role: "ROOT", sv: 0 }), false);
  assert.equal(isSessionClaims({ userId: "u1", role: "ADMIN", sv: "0" }), false);
  assert.equal(isSessionClaims({ userId: "u1", role: "ADMIN", sv: 1.5 }), false);
  assert.equal(isSessionClaims({ userId: "", role: "ADMIN", sv: 0 }), false);
  assert.equal(isSessionClaims({ userId: "u1", role: "ADMIN", sv: 0, purpose: "other" }), false);
  assert.equal(isSessionClaims(null), false);
});
