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

/**
 * Ссылка «следить за курьером» экспресс-доставки Яндекса из снимка заявки (Order.shipmentData): появляется после
 * назначения курьера, по ней клиентка видит его на карте. Работает без импорта серверного модуля.
 */
export function yandexTrackingLink(shipmentData: unknown): string | null {
  const s = shipmentData as { provider?: string; trackingLink?: string | null } | null | undefined;
  return s?.provider === "yandex" && typeof s.trackingLink === "string" && /^https?:\/\//.test(s.trackingLink) ? s.trackingLink : null;
}
