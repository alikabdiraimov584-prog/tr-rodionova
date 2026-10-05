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
  // сущность бренда для поисковиков и ИИ-ответов (schema.org Organization, llms.txt)
  description: string; // одно-два фактических предложения о бренде
  foundedYear: string; // год основания
  founder: string; // основательница (Person в разметке и автор журнала)
  city: string; // город
  instagram: string;
  vk: string;
  pinterest: string;
  youtube: string;
  dzen: string;
  yandexBusiness: string; // ссылка на карточку в Яндекс Бизнес / Картах
  twoGis: string; // ссылка на карточку в 2ГИС
  wikidata: string; // ссылка на элемент Wikidata, если есть
  showroomGeo: string; // координаты шоурума «широта, долгота»
  pressLinks: string; // публикации о бренде, по одной на строку: «Издание, дата — https://…»
};

/** Реквизиты продавца: обязательны на сайте по ст. 26.1 ЗоЗПП и Правилам дистанционной торговли. */
export type SellerSettings = {
  name: string; // ИП Иванова И.И. / ООО «…»
  inn: string;
  ogrn: string;
  address: string; // адрес регистрации
  hours: string; // режим работы
  showroom: string; // адрес шоурума (если есть)
  // банковские реквизиты: оплата переводом, накладные, оферта
  bank: string;
  bik: string;
  account: string; // расчётный счёт
  corrAccount: string; // корреспондентский счёт
  responsible: string; // ответственный за обработку ПДн (политика, 152-ФЗ)
  claimsAddress: string; // почтовый адрес для претензий и возвратов
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

/** Чем считать себестоимость в P&L: фактическими расходами на производство (проводки «Производство») или ценой закупки из карточек при продаже. */
export type PnlCostMethod = "production" | "cogs";

export type FinanceSettings = {
  openingBalance: number; // остаток денег на начало учёта, копейки
  openingDate: string; // ГГГГ-ММ-ДД: с этой даты считается остаток в ДДС
  pnlCost: PnlCostMethod;
};

const defaults: { support: SupportSettings; loyalty: LoyaltySettings; delivery: DeliverySettings; brand: BrandSettings; seller: SellerSettings; finance: FinanceSettings } = {
  finance: { openingBalance: 0, openingDate: "", pnlCost: "production" },
  seller: {
    name: "ИП Родионова Татьяна Ивановна",
    inn: "211501713609",
    ogrn: "325210000063620",
    address: "429909, Россия, Чувашская Республика, Цивильский район, д. Елюккасы, ул. Луговая, д. 9",
    hours: "ежедневно 10:00–21:00",
    showroom: "",
    bank: "АО «ТБанк»",
    bik: "044525974",
    account: "40802810600008690404",
    corrAccount: "30101810145250000974",
    responsible: "Родионова Татьяна Ивановна",
    claimsAddress: "429909, Россия, Чувашская Республика, Цивильский район, д. Елюккасы, ул. Луговая, д. 9",
  },
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
    email: "care@tr-rodionova.ru",
    telegram: "https://t.me/trodionova",
    description: "Премиальная женская одежда из натуральных тканей: шерсть, кашемир, шёлк. Тираж до 60 единиц на модель, пошив в Португалии и Литве, контроль качества в Москве.",
    foundedYear: "2019",
    founder: "Татьяна Родионова",
    city: "Москва",
    instagram: "",
    vk: "",
    pinterest: "",
    youtube: "",
    dzen: "",
    yandexBusiness: "",
    twoGis: "",
    wikidata: "",
    showroomGeo: "",
    pressLinks: "",
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
