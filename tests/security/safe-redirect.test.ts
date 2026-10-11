import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../src/lib/safe-redirect";

test("accepts internal paths and preserves query/hash", () => {
  assert.equal(safeNext("/catalog", "/"), "/catalog");
  assert.equal(safeNext("/catalog?sort=new#sizes", "/"), "/catalog?sort=new#sizes");
});

test("rejects absolute and protocol-relative URLs", () => {
  assert.equal(safeNext("https://evil.example", "/account"), "/account");
  assert.equal(safeNext("//evil.example/path", "/account"), "/account");
});

test("rejects backslash-based redirects and control characters", () => {
  assert.equal(safeNext("/\\\\evil.example", "/account"), "/account");
  assert.equal(safeNext("/\\evil.example", "/account"), "/account");
  assert.equal(safeNext("/catalog\r\nLocation:https://evil.example", "/account"), "/account");
});

test("rejects non-string and relative values", () => {
  assert.equal(safeNext(null, "/account"), "/account");
  assert.equal(safeNext("catalog", "/account"), "/account");
});
