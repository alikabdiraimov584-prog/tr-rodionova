export type RfmInput = { lastOrderAt: Date | null; ordersCount: number; lifetimeSpent: number; createdAt: Date };

export type RfmSegment = {
  code: "champion" | "loyal" | "potential" | "new" | "at_risk" | "sleeping" | "lost" | "prospect";
  label: string;
  tone: "success" | "info" | "gold" | "warning" | "danger" | "neutral";
  advice: string;
};

export const SEGMENTS: Record<RfmSegment["code"], RfmSegment> = {
  champion: { code: "champion", label: "Чемпионы", tone: "gold", advice: "Ранний доступ, персональный стилист, закрытые показы" },
  loyal: { code: "loyal", label: "Лояльные", tone: "success", advice: "Предложить следующий уровень, кросс-продажи из капсулы" },
  potential: { code: "potential", label: "Перспективные", tone: "info", advice: "Второй заказ: подборка под первый, бонус за отзыв" },
  new: { code: "new", label: "Новые", tone: "info", advice: "Welcome-цепочка, напоминание о приветственных баллах" },
  at_risk: { code: "at_risk", label: "Под угрозой", tone: "warning", advice: "Личное сообщение менеджера, новинки коллекции" },
  sleeping: { code: "sleeping", label: "Спящие", tone: "warning", advice: "Реактивация: баллы с коротким сроком, приглашение в шоурум" },
  lost: { code: "lost", label: "Потерянные", tone: "danger", advice: "Win-back кампания раз в сезон, не чаще" },
  prospect: { code: "prospect", label: "Без покупок", tone: "neutral", advice: "Довести до первой покупки: промокод WELCOME10" },
};

export function daysSince(d: Date | null, now = new Date()) {
  if (!d) return Infinity;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export function rfmSegment(i: RfmInput, now = new Date()): RfmSegment {
  const recency = daysSince(i.lastOrderAt, now);
  const f = i.ordersCount;
  const m = i.lifetimeSpent;
  if (f === 0) return SEGMENTS.prospect;
  if (recency <= 90 && f >= 4 && m >= 30_000_000) return SEGMENTS.champion;
  if (recency <= 120 && f >= 3) return SEGMENTS.loyal;
  if (recency <= 60 && f === 1) return SEGMENTS.new;
  if (recency <= 120 && f >= 1) return SEGMENTS.potential;
  if (recency <= 240) return SEGMENTS.at_risk;
  if (recency <= 365) return SEGMENTS.sleeping;
  return SEGMENTS.lost;
}
