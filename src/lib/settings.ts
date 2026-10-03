import "server-only";
import { db } from "@/lib/db";

export type LoyaltySettings = {
  welcomePoints: number;
  referralPoints: number;
  reviewPoints: number;
  pointsExpireDays: number;
  pointValueKopecks: number;
};
export type DeliverySettings = {
  freeFrom: number;
  courier: number;
  cdek: number;
  boxberry: number;
  yandex: number;
};
export type BrandSettings = {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  telegram: string;
};

export type SupportSettings = {
  workFrom: number; // час начала работы, МСК
  workTo: number;
  workDays: number[]; // 1 = пн … 7 = вс
  autoReply: boolean;
  autoReplyText: string;
  slaMinutes: number; // целевое время первого ответа
  reopenDays: number; // новое сообщение в закрытый диалог моложе N дней переоткрывает его
};

const defaults: { support: SupportSettings; loyalty: LoyaltySettings; delivery: DeliverySettings; brand: BrandSettings } = {
  support: {
    workFrom: 10,
    workTo: 21,
    workDays: [1, 2, 3, 4, 5, 6, 7],
    autoReply: true,
    autoReplyText: "Здравствуйте! Спасибо за сообщение. Мы на связи ежедневно с 10:00 до 21:00 по Москве и ответим в начале рабочего дня. — Команда T.Rodionova",
    slaMinutes: 15,
    reopenDays: 3,
  },
  loyalty: {
    welcomePoints: 2000,
    referralPoints: 2000,
    reviewPoints: 300,
    pointsExpireDays: 365,
    pointValueKopecks: 100,
  },
  delivery: { freeFrom: 1_500_000, courier: 50_000, cdek: 35_000, boxberry: 30_000, yandex: 45_000 },
  brand: {
    name: "T.Rodionova",
    tagline: "Premium womenswear",
    phone: "+7 (495) 000-00-00",
    email: "care@t-rodionova.ru",
    telegram: "https://t.me/trodionova",
  },
};

type SettingsMap = typeof defaults;

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...defaults[key], ...((row?.value as object) ?? {}) } as SettingsMap[K];
}

/** То же, но без базы (например, при сборке статических страниц) возвращает значения по умолчанию. */
export async function getSettingOrDefault<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  try {
    return await getSetting(key);
  } catch {
    return defaults[key] as SettingsMap[K];
  }
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
