import type { ResaleStatus } from "@/generated/prisma/enums";

/** Состояния вещи для выкупа и доля от цены покупки, которую бренд возвращает баллами. */
export const RESALE_CONDITIONS: { value: string; label: string; pct: number; hint: string }[] = [
  { value: "как новое", label: "Как новое", pct: 30, hint: "надевалась 1–2 раза, без следов носки, с ярлыками или без" },
  { value: "хорошее", label: "Хорошее", pct: 20, hint: "носилась аккуратно, без дефектов, после химчистки" },
  { value: "со следами носки", label: "Со следами носки", pct: 10, hint: "катышки, потёртости, небольшие дефекты — оцениваем индивидуально" },
];

export function conditionPct(condition: string | null | undefined): number {
  return RESALE_CONDITIONS.find((c) => c.value === condition)?.pct ?? 10;
}

/** Максимум баллов за вещь: доля от цены покупки (копейки) по стоимости балла. */
export function maxOfferPoints(priceKopecks: number, condition: string | null | undefined, pointValueKopecks = 100): number {
  return Math.floor((priceKopecks * conditionPct(condition)) / 100 / pointValueKopecks);
}

/** Статусы, при которых заявка ещё «в работе» и по той же вещи нельзя подать новую. */
export const RESALE_ACTIVE: ResaleStatus[] = ["REQUESTED", "OFFERED", "ACCEPTED", "RECEIVED", "LISTED"];

/** Статусы, из которых клиентка может отменить заявку сама. */
export const RESALE_CANCELLABLE: ResaleStatus[] = ["REQUESTED", "OFFERED", "ACCEPTED"];
