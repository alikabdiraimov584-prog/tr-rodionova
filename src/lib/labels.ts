import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  DeliveryMethod,
  StockMovementType,
  PointsType,
  LedgerType,
  TaskStatus,
  Role,
  PromoType,
  ProductStatus,
} from "@/generated/prisma/enums";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  NEW: { label: "Ожидает оплаты", tone: "warning" },
  PAID: { label: "Оплачен", tone: "info" },
  CONFIRMED: { label: "Подтверждён", tone: "info" },
  PACKING: { label: "Комплектуется", tone: "info" },
  SHIPPED: { label: "В доставке", tone: "info" },
  DELIVERED: { label: "Доставлен", tone: "success" },
  COMPLETED: { label: "Завершён", tone: "success" },
  CANCELLED: { label: "Отменён", tone: "danger" },
  RETURNED: { label: "Возврат", tone: "danger" },
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  CARD: "Банковская карта",
  SBP: "СБП",
  INSTALLMENT: "Рассрочка",
  CASH_ON_DELIVERY: "При получении",
  MANUAL: "Перевод по реквизитам",
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Ожидает", tone: "warning" },
  SUCCEEDED: { label: "Оплачен", tone: "success" },
  FAILED: { label: "Ошибка", tone: "danger" },
  REFUNDED: { label: "Возвращён", tone: "danger" },
  PARTIALLY_REFUNDED: { label: "Частичный возврат", tone: "warning" },
};

export const DELIVERY_METHOD: Record<DeliveryMethod, { label: string; hint: string }> = {
  COURIER: { label: "Курьер", hint: "Москва и Санкт-Петербург, 1–2 дня, примерка" },
  CDEK: { label: "СДЭК", hint: "До пункта выдачи или курьером, 2–7 дней" },
  BOXBERRY: { label: "Boxberry", hint: "До пункта выдачи, 2–7 дней" },
  YANDEX: { label: "Яндекс Доставка", hint: "Курьером в день заказа по Москве" },
  PICKUP: { label: "Самовывоз", hint: "Шоурум, Москва, Большая Никитская 14" },
};

export const STOCK_MOVEMENT: Record<StockMovementType, { label: string; tone: Tone }> = {
  RECEIPT: { label: "Приход", tone: "success" },
  SALE: { label: "Продажа", tone: "info" },
  RETURN: { label: "Возврат", tone: "warning" },
  WRITE_OFF: { label: "Списание", tone: "danger" },
  ADJUSTMENT: { label: "Инвентаризация", tone: "neutral" },
  RESERVE: { label: "Резерв", tone: "neutral" },
  RELEASE: { label: "Снятие резерва", tone: "neutral" },
};

export const POINTS_TYPE: Record<PointsType, string> = {
  EARN_PURCHASE: "Начисление за покупку",
  EARN_WELCOME: "Приветственный бонус",
  EARN_BIRTHDAY: "Подарок ко дню рождения",
  EARN_REFERRAL: "Бонус за приглашение",
  EARN_REVIEW: "Бонус за отзыв",
  EARN_MANUAL: "Начисление менеджером",
  SPEND_PURCHASE: "Оплата баллами",
  REVERT: "Отмена начисления",
  EXPIRE: "Сгорание баллов",
};

export const LEDGER_TYPE: Record<LedgerType, { label: string; sign: 1 | -1 }> = {
  INCOME_SALE: { label: "Выручка от продаж", sign: 1 },
  INCOME_OTHER: { label: "Прочие доходы", sign: 1 },
  EXPENSE_COGS: { label: "Себестоимость", sign: -1 },
  EXPENSE_SHIPPING: { label: "Доставка", sign: -1 },
  EXPENSE_MARKETING: { label: "Маркетинг", sign: -1 },
  EXPENSE_PRODUCTION: { label: "Производство", sign: -1 },
  EXPENSE_SALARY: { label: "Зарплаты", sign: -1 },
  EXPENSE_RENT: { label: "Аренда", sign: -1 },
  EXPENSE_ACQUIRING: { label: "Эквайринг", sign: -1 },
  EXPENSE_OTHER: { label: "Прочие расходы", sign: -1 },
  REFUND: { label: "Возврат покупателю", sign: -1 },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Открыта", tone: "warning" },
  DONE: { label: "Выполнена", tone: "success" },
  CANCELLED: { label: "Отменена", tone: "neutral" },
};

export const ROLE: Record<Role, string> = {
  CUSTOMER: "Клиент",
  SUPPORT: "Поддержка",
  MANAGER: "Менеджер",
  ADMIN: "Администратор",
};

export const PROMO_TYPE: Record<PromoType, string> = {
  PERCENT: "Скидка, %",
  FIXED: "Скидка, ₽",
  FREE_SHIPPING: "Бесплатная доставка",
};

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  ACTIVE: { label: "В продаже", tone: "success" },
  ARCHIVED: { label: "Архив", tone: "danger" },
};

export const TRAFFIC_CHANNEL: Record<string, string> = {
  DIRECT: "Прямые заходы",
  ORGANIC: "Поиск",
  SOCIAL: "Соцсети и мессенджеры",
  PAID: "Реклама",
  EMAIL: "Рассылки",
  REFERRAL: "Переходы с сайтов",
  INTERNAL: "Ссылки бренда",
};

import type { GiftCardStatus, ResaleStatus, SelectionStatus } from "@/generated/prisma/enums";

export const GIFT_STATUS: Record<GiftCardStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Ожидает оплаты", tone: "warning" },
  ACTIVE: { label: "Активен", tone: "success" },
  USED: { label: "Использован", tone: "neutral" },
  EXPIRED: { label: "Истёк", tone: "danger" },
  CANCELLED: { label: "Отменён", tone: "danger" },
};

export const RESALE_STATUS: Record<ResaleStatus, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Заявка", tone: "warning" },
  OFFERED: { label: "Предложение сделано", tone: "info" },
  ACCEPTED: { label: "Ждём вещь", tone: "info" },
  RECEIVED: { label: "Получена, баллы начислены", tone: "success" },
  LISTED: { label: "На витрине", tone: "gold" },
  SOLD: { label: "Продана", tone: "success" },
  DECLINED: { label: "Отклонена", tone: "danger" },
  CANCELLED: { label: "Отменена", tone: "neutral" },
};

export const SELECTION_STATUS: Record<SelectionStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SENT: { label: "Отправлена", tone: "info" },
  VIEWED: { label: "Просмотрена", tone: "success" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
};

export const TIER_TONE: Record<string, Tone> = {
  BASE: "neutral",
  SILVER: "info",
  GOLD: "gold",
  BLACK: "danger",
};

import type { Channel, ConversationStatus } from "@/generated/prisma/enums";

export const CHANNEL: Record<Channel, { label: string; short: string; color: string }> = {
  TELEGRAM: { label: "Telegram", short: "TG", color: "#2AABEE" },
  WHATSAPP: { label: "WhatsApp", short: "WA", color: "#25D366" },
  INSTAGRAM: { label: "Instagram", short: "IG", color: "#C13584" },
  VK: { label: "ВКонтакте", short: "VK", color: "#0077FF" },
  EMAIL: { label: "Email", short: "@", color: "#6F675E" },
  SMS: { label: "SMS", short: "SMS", color: "#8B7F71" },
  WEBSITE: { label: "Сайт", short: "TR", color: "#A89B8C" },
};

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Ждёт ответа", tone: "warning" },
  PENDING: { label: "Ждём клиента", tone: "info" },
  CLOSED: { label: "Закрыт", tone: "neutral" },
};
