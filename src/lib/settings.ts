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

const defaults = {
  loyalty: {
    welcomePoints: 1000,
    referralPoints: 1500,
    reviewPoints: 300,
    pointsExpireDays: 365,
    pointValueKopecks: 100,
  } satisfies LoyaltySettings,
  delivery: { freeFrom: 1_500_000, courier: 50_000, cdek: 35_000, boxberry: 30_000, yandex: 45_000 } satisfies DeliverySettings,
  brand: {
    name: "T.Rodionova",
    tagline: "Premium womenswear",
    phone: "+7 (495) 000-00-00",
    email: "care@t-rodionova.ru",
    telegram: "https://t.me/trodionova",
  } satisfies BrandSettings,
};

type SettingsMap = typeof defaults;

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...defaults[key], ...((row?.value as object) ?? {}) } as SettingsMap[K];
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
