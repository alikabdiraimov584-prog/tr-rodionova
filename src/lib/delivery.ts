import type { DeliveryMethod } from "@/generated/prisma/enums";

/** Ссылка на отслеживание посылки у службы доставки по трек-номеру. */
export function trackingUrl(method: DeliveryMethod, trackingNumber: string | null | undefined) {
  const n = trackingNumber?.trim();
  if (!n) return null;
  switch (method) {
    case "CDEK":
      return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(n)}`;
    case "BOXBERRY":
      return `https://boxberry.ru/tracking-page?id=${encodeURIComponent(n)}`;
    case "YANDEX":
      return `https://delivery.yandex.ru/tracking/${encodeURIComponent(n)}`;
    default:
      return null;
  }
}
