/**
 * Код подтверждения Вебмастера и Search Console из того, что вставили в CRM. Кабинеты показывают его целиком тегом
 * (<meta name="yandex-verification" content="…" />) или строкой для DNS (google-site-verification=…), и такой текст
 * чаще всего и копируют. Без разбора он попадал бы в content как есть, и поисковик не находил бы свой код.
 */
export function verificationCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let s = raw.trim();
  const content = s.match(/content\s*=\s*["']([^"']*)["']/i);
  if (content) s = content[1];
  s = s.replace(/^(yandex-verification|google-site-verification)\s*[:=]\s*/i, "").trim();
  // настоящий код — латиница, цифры, «-» и «_»; всё остальное (обрывок тега, пробелы) не выводим
  return /^[A-Za-z0-9_-]{6,100}$/.test(s) ? s : undefined;
}
