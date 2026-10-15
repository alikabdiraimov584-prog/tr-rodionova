import test from "node:test";
import assert from "node:assert/strict";
import { publicAppUrl } from "../../src/lib/public-app-url";

test("uses only the configured canonical origin", () => {
  const previousApp = process.env.APP_URL;
  const previousPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const env = process.env as Record<string, string | undefined>;
  const previousEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    process.env.APP_URL = "https://shop.example/";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(publicAppUrl(), "https://shop.example");
  } finally {
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublic;
    if (previousEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousEnv;
  }
});

test("rejects missing, insecure, or URL-decorated production origins", () => {
  const previousApp = process.env.APP_URL;
  const previousPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const previousEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.throws(() => publicAppUrl(), /APP_URL must be configured/);
    process.env.APP_URL = "http://shop.example";
    assert.throws(() => publicAppUrl(), /HTTPS/);
    process.env.APP_URL = "https://shop.example/?next=https://evil.invalid";
    assert.throws(() => publicAppUrl(), /only the public site origin/);
    process.env.APP_URL = "https://user:pass@shop.example";
    assert.throws(() => publicAppUrl(), /only the public site origin/);
    process.env.APP_URL = "https://shop.example/path";
    assert.throws(() => publicAppUrl(), /only the public site origin/);
  } finally {
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublic;
    if (previousEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousEnv;
  }
});

test("local development has a safe deterministic fallback", () => {
  const previousApp = process.env.APP_URL;
  const previousPublic = process.env.NEXT_PUBLIC_SITE_URL;
  const previousEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "development";
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(publicAppUrl(), "http://localhost:3000");
  } finally {
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousPublic;
    if (previousEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousEnv;
  }
});
