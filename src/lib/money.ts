/** Все суммы хранятся в копейках (Int). */
export const RUB = 100;

export function formatMoney(kopecks: number, opts: { withSign?: boolean } = {}): string {
  const sign = kopecks < 0 ? "−" : opts.withSign && kopecks > 0 ? "+" : "";
  const abs = Math.abs(kopecks);
  const rub = Math.floor(abs / RUB);
  const kop = abs % RUB;
  const rubStr = rub.toLocaleString("ru-RU").replace(/,/g, " ");
  return `${sign}${rubStr}${kop ? "," + String(kop).padStart(2, "0") : ""} ₽`;
}

export function formatPoints(points: number, opts: { withSign?: boolean } = {}): string {
  const sign = points < 0 ? "−" : opts.withSign && points > 0 ? "+" : "";
  return `${sign}${Math.abs(points).toLocaleString("ru-RU")} ${plural(Math.abs(points), ["балл", "балла", "баллов"])}`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

export function toKopecks(rubles: number | string): number {
  const n = typeof rubles === "string" ? parseFloat(rubles.replace(",", ".").replace(/\s/g, "")) : rubles;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * RUB);
}

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: withTime ? "2-digit" : "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
