/**
 * Canonical public origin for payment-provider return URLs.
 * Never derive payment redirects from the request Host/X-Forwarded-* headers:
 * those values can be attacker-controlled and would let an attacker register a
 * phishing return URL with a trusted payment provider.
 */
export function publicAppUrl(): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL must be configured in production");
    }
    return "http://localhost:3000";
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("APP_URL must be a valid absolute URL");
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_URL must contain only the public site origin");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  return url.origin;
}
