/**
 * Validate an internal redirect target. A leading slash alone is not enough:
 * browsers normalize backslashes in special URLs, so "/\\evil.example" can become external.
 */
const INTERNAL_ORIGIN = "https://tr-rodionova.invalid";

export function safeNext(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\\u0000-\\u001f\\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
