import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedBody } from "../../src/lib/read-bounded-body";

test("reads request bodies within the byte limit", async () => {
  const request = new Request("https://example.test/webhook", {
    method: "POST",
    body: JSON.stringify({ id: "payment-123" }),
  });
  assert.equal(await readBoundedBody(request, 100), '{"id":"payment-123"}');
});

test("rejects bodies larger than the limit even when streamed", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
      controller.close();
    },
  });
  const request = new Request("https://example.test/webhook", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.equal(await readBoundedBody(request, 7), null);
});

test("rejects invalid UTF-8 instead of silently replacing bytes", async () => {
  const request = new Request("https://example.test/webhook", {
    method: "POST",
    body: new Uint8Array([0xc3, 0x28]),
  });
  assert.equal(await readBoundedBody(request, 10), null);
});

test("rejects invalid byte limits", async () => {
  const request = new Request("https://example.test/webhook", { method: "POST" });
  await assert.rejects(readBoundedBody(request, -1), RangeError);
});
