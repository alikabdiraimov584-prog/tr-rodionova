import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isCurrentEncryption } from "@/lib/crypto";

test("versioned encryption keeps legacy reads while v2 uses the independent key", () => {
  const oldAuth = process.env.AUTH_SECRET;
  const oldKey = process.env.ENCRYPTION_KEY;
  const oldActive = process.env.ENCRYPTION_KEY_ACTIVE;
  try {
    process.env.AUTH_SECRET = "test-only-auth-secret-with-more-than-32-characters";
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY_ACTIVE;
    const v1 = encryptSecret("legacy-secret");
    assert.ok(v1.startsWith("enc:v1:"));
    assert.equal(decryptSecret(v1), "legacy-secret");
    assert.equal(isCurrentEncryption(v1), false);

    process.env.ENCRYPTION_KEY = "test-only-independent-encryption-key-with-more-than-32-chars";
    process.env.ENCRYPTION_KEY_ACTIVE = "1";
    const v2 = encryptSecret("independent-secret");
    assert.ok(v2.startsWith("enc:v2:"));
    assert.equal(decryptSecret(v2), "independent-secret");
    assert.equal(decryptSecret(v1), "legacy-secret");
    assert.equal(isCurrentEncryption(v2), true);
  } finally {
    if (oldAuth === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = oldAuth;
    if (oldKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = oldKey;
    if (oldActive === undefined) delete process.env.ENCRYPTION_KEY_ACTIVE;
    else process.env.ENCRYPTION_KEY_ACTIVE = oldActive;
  }
});
