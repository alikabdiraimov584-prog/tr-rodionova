import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationCode } from "../../src/lib/site-verification";

test("код подтверждения: чистый код остаётся как есть", () => {
  assert.equal(verificationCode("6cfb9e68121c4185"), "6cfb9e68121c4185");
  assert.equal(verificationCode("  TjzNBAlfQRYkGBDgDY4fH7L4dqVILXnbTkZubNATnoY "), "TjzNBAlfQRYkGBDgDY4fH7L4dqVILXnbTkZubNATnoY");
});

test("код подтверждения: из вставленного целиком тега берётся content", () => {
  assert.equal(verificationCode('<meta name="yandex-verification" content="6cfb9e68121c4185" />'), "6cfb9e68121c4185");
  assert.equal(verificationCode("<meta name='google-site-verification' content='abc_DEF-123456'>"), "abc_DEF-123456");
});

test("код подтверждения: строка для DNS без префикса", () => {
  assert.equal(verificationCode("google-site-verification=TjzNBAlfQRYkGBDgDY4fH7L4dqVILXnbTkZubNATnoY"), "TjzNBAlfQRYkGBDgDY4fH7L4dqVILXnbTkZubNATnoY");
  assert.equal(verificationCode("yandex-verification: 6cfb9e68121c4185"), "6cfb9e68121c4185");
});

test("код подтверждения: мусор не выводится", () => {
  assert.equal(verificationCode(""), undefined);
  assert.equal(verificationCode('<meta name="x">'), undefined);
  assert.equal(verificationCode('6cfb"><script>'), undefined);
  assert.equal(verificationCode(undefined), undefined);
});
