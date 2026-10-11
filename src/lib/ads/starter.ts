import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { metrikaAccess, metrikaGoalIds, ensureRetargetingFlag } from "@/lib/metrika-api";
import { MIN_WEEKLY_RUB, PROVIDER, directCall, errorsOf, idOf, mskDate, suspendCampaigns, syncCampaigns, toMicro, type ActionResult, type DirectConfig } from "@/lib/ads/direct";

/**
 * Стартовый набор кампаний Директа для бренда: брендовый поиск, поиск по категориям каталога, ретаргетинг в сетях.
 * Тексты объявлений собираются только из проверяемых фактов бренда и данных каталога (категории, цены, ткани).
 * В каждой группе два варианта объявления — A/B-тест, который дальше ведёт оптимизатор.
 */

export type Region = "msk" | "spb" | "ru";
export const REGIONS: Record<Region, { label: string; ids: number[] }> = {
  msk: { label: "Москва и область", ids: [213, 1] },
  spb: { label: "Санкт-Петербург и область", ids: [2, 10174] },
  ru: { label: "Вся Россия", ids: [225] },
};

export type StarterInput = {
  monthlyBudgetRub: number;
  regions: Region[];
  /** Целевая стоимость заказа, ₽ */
  targetCpaRub: number;
  categories: string[];
  brand: boolean;
  retargeting: boolean;
  actorId: string | null;
};

export type StarterResult = { created: { name: string; id: number; kind: string }[]; warnings: string[]; errors: string[] };

/** Минус-слова общие для всех поисковых кампаний: чужие маркетплейсы, детское и мужское, выкройки, б/у, фото. */
export const NEGATIVE_KEYWORDS = [
  "бесплатно", "выкройка", "выкройки", "сшить", "своими руками", "крючком", "спицами", "вязание", "схема", "мастер класс",
  "бу", "б у", "б/у", "авито", "юла", "wildberries", "вайлдберриз", "вб", "ozon", "озон", "ламода", "lamoda", "zara", "hm", "h&m",
  "детское", "детский", "детская", "для девочки", "для девочек", "для новорожденных", "для малышей", "мужской", "мужские", "мужское",
  "фото", "картинки", "рисунок", "оптом", "опт", "секонд", "секонд хенд", "аренда", "прокат", "вакансии", "работа", "вакансия",
  "дешево", "дешевые", "дешёвые", "недорого", "распродажа", "скидки", "скидка", "спортивное", "спортивные", "купальник", "пляжный",
  "ткань купить", "пряжа", "как носить", "с чем носить", "что такое", "википедия", "отзывы", "размерная сетка",
];

type CategoryTemplate = { noun: string; keywords: string[]; features: string[] };

/** Ключевые фразы и короткие особенности по категориям каталога (slug). Неизвестные категории получают общие фразы. */
const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  bodysuits: {
    noun: "Боди",
    keywords: ["боди женское купить", "боди женское бренд", "боди с длинным рукавом женское", "боди с открытыми плечами", "базовое боди женское", "боди премиум", "элегантное боди женское", "боди под жакет", "боди с высокой горловиной", "дизайнерское боди"],
    features: ["Высокая горловина, открытые плечи, плотное полотно не просвечивает"],
  },
  trousers: {
    noun: "Брюки",
    keywords: ["брюки женские купить", "брюки палаццо женские", "широкие брюки женские", "брюки из шерсти женские", "брюки с высокой посадкой женские", "брюки премиум бренд", "костюмные брюки женские", "брюки со стрелками женские", "дизайнерские брюки женские", "шерстяные брюки женские"],
    features: ["Высокая посадка, защипы, стрелки: сидят по фигуре и не мнутся"],
  },
  skirts: {
    noun: "Юбки",
    keywords: ["юбка женская купить", "юбка мини из шерсти", "юбка трапеция купить", "юбка с запахом женская", "юбка премиум бренд", "шерстяная юбка женская", "юбка с высокой посадкой", "дизайнерская юбка", "юбка мини женская бренд"],
    features: ["Юбка-трапеция с запахом и пряжкой TR: держит форму весь день"],
  },
  jackets: {
    noun: "Жакеты",
    keywords: ["жакет женский купить", "жакет приталенный женский", "жакет с баской", "жакет из шерсти женский", "вечерний жакет женский", "пиджак женский премиум", "жакет российский бренд", "дизайнерский жакет", "жакет с открытой спиной"],
    features: ["Приталенный жакет с баской и открытой спиной, шерсть с шёлком"],
  },
  dresses: {
    noun: "Платья",
    keywords: ["платье купить бренд", "шёлковое платье мини", "шелковое платье купить", "платье с открытой спиной", "вечернее платье мини", "платье халтер", "платье премиум бренд", "платье российский дизайнер", "дизайнерское платье купить", "платье из шёлка"],
    features: ["Шёлковый креп из Комо, воротник-халтер, открытая спина"],
  },
};

/** Уложиться в лимит Директа (Title 56, Title2 30, Text 81): сначала по границе предложения, затем по границе слова. */
export function fit(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const i = cut.lastIndexOf(" ");
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s,.;:—-]+$/, "");
}

const fmtRub = (kopecks: number) => `${Math.round(kopecks / 100).toLocaleString("ru-RU")} ₽`;

/** Родительный падеж материалов для заголовка «Брюки из шерсти»; незнакомый материал в заголовок не попадает. */
const GENITIVE: Record<string, string> = { шерсть: "шерсти", шёлк: "шёлка", шелк: "шёлка", кашемир: "кашемира", вискоза: "вискозы", хлопок: "хлопка", лён: "льна", лен: "льна", трикотаж: "трикотажа", кожа: "кожи", деним: "денима", твид: "твида", атлас: "атласа", купро: "купро", полиэстер: "полиэстера", альпака: "альпаки", мохер: "мохера" };
const genitive = (m: string) => GENITIVE[m.trim().toLowerCase()];

function utmHref(base: string, pathname: string, utm: string, extra = "") {
  return `${base}${pathname}${pathname.includes("?") ? "&" : "?"}utm_source=yandex&utm_medium=cpc&utm_campaign=${utm}&utm_content={ad_id}${extra}`;
}

type Ad = { Title: string; Title2: string; Text: string; Href: string };

/** Распределение месячного бюджета по кампаниям, ₽ в неделю: бренд 10 %, ретаргетинг 20 %, остальное — категории. */
export function splitBudget(monthlyRub: number, parts: { brand: boolean; retargeting: boolean; categories: number }) {
  const weekly = (monthlyRub * 12) / 52;
  const brand = parts.brand ? weekly * 0.1 : 0;
  const retargeting = parts.retargeting ? weekly * 0.2 : 0;
  const perCategory = parts.categories ? (weekly - brand - retargeting) / parts.categories : 0;
  const r = (v: number) => Math.max(MIN_WEEKLY_RUB, Math.round(v / 10) * 10);
  return { brand: parts.brand ? r(brand) : 0, retargeting: parts.retargeting ? r(retargeting) : 0, perCategory: parts.categories ? r(perCategory) : 0, weeklyTotal: Math.round(weekly) };
}

async function addCampaign(cfg: DirectConfig, campaign: Record<string, unknown>, warnings: string[]): Promise<number> {
  try {
    const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "campaigns", "add", { Campaigns: [campaign] });
    return idOf(r.AddResults, "Кампания");
  } catch (e) {
    // счётчик Метрики недоступен логину Директа: создаём без привязки, иначе весь набор не создаётся
    const tc = campaign.TextCampaign as Record<string, unknown> | undefined;
    if (tc && (tc.CounterIds || tc.PriorityGoals)) {
      warnings.push(`«${campaign.Name}»: Директ не принял счётчик Метрики (${e instanceof Error ? e.message : e}). Кампания создана без привязки к счётчику: выдайте логину Директа доступ к счётчику и привяжите его в настройках кампании.`);
      const { CounterIds: _c, PriorityGoals: _p, ...rest } = tc;
      void _c;
      void _p;
      const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "campaigns", "add", { Campaigns: [{ ...campaign, TextCampaign: rest }] });
      return idOf(r.AddResults, "Кампания");
    }
    throw e;
  }
}

async function addGroup(cfg: DirectConfig, campaignId: number, name: string, regionIds: number[]) {
  const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "adgroups", "add", { AdGroups: [{ Name: name, CampaignId: campaignId, RegionIds: regionIds }] });
  return idOf(r.AddResults, "Группа");
}

/** Ключевые фразы плюс обязательный автотаргетинг (точные и альтернативные запросы, без конкурентов и широких). */
async function addKeywords(cfg: DirectConfig, groupId: number, keywords: string[], warnings: string[]) {
  const items = keywords.map((k) => ({ Keyword: k, AdGroupId: groupId }));
  const auto = { Keyword: "---autotargeting", AdGroupId: groupId, AutotargetingSettings: [{ Category: "EXACT", Value: "YES" }, { Category: "ALTERNATIVE", Value: "YES" }, { Category: "COMPETITOR", Value: "NO" }, { Category: "BROADER", Value: "NO" }, { Category: "ACCESSORY", Value: "NO" }] };
  let r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "keywords", "add", { Keywords: [...items, auto] });
  let errs = errorsOf(r.AddResults);
  if (errs.length) {
    // старые кабинеты не принимают настройки категорий автотаргетинга — добавляем его без них
    r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "keywords", "add", { Keywords: [...items, { Keyword: "---autotargeting", AdGroupId: groupId }] });
    errs = errorsOf(r.AddResults);
    if (errs.length) warnings.push(`Фразы группы ${groupId}: ${errs.join("; ")}`);
  }
  return (r.AddResults ?? []).filter((x) => x.Id).length;
}

async function addAds(cfg: DirectConfig, groupId: number, ads: Ad[], extra: { SitelinkSetId?: number; AdImageHash?: string }, warnings: string[]) {
  const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "ads", "add", { Ads: ads.map((a) => ({ AdGroupId: groupId, TextAd: { Title: fit(a.Title, 56), Title2: fit(a.Title2, 30), Text: fit(a.Text, 81), Href: a.Href, Mobile: "NO", ...extra } })) });
  const errs = errorsOf(r.AddResults);
  if (errs.length) warnings.push(`Объявления группы ${groupId}: ${errs.join("; ")}`);
  return (r.AddResults ?? []).filter((x) => x.Id).length;
}

/** Быстрые ссылки под объявлением: каталог, доставка и примерка, размеры, о бренде. Один набор на все кампании. */
async function addSitelinks(cfg: DirectConfig, base: string, warnings: string[]): Promise<number | undefined> {
  try {
    const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "sitelinks", "add", {
      SitelinksSets: [{ Sitelinks: [
        { Title: "Каталог", Href: `${base}/catalog?utm_source=yandex&utm_medium=cpc&utm_campaign=sitelink`, Description: "Боди, брюки, юбки, жакеты и платья" },
        { Title: "Доставка и примерка", Href: `${base}/delivery?utm_source=yandex&utm_medium=cpc&utm_campaign=sitelink`, Description: "Примерка курьером в Москве и Петербурге" },
        { Title: "Размеры и мерки", Href: `${base}/sizes?utm_source=yandex&utm_medium=cpc&utm_campaign=sitelink`, Description: "Таблица размеров XS–L и подсказки по посадке" },
        { Title: "О бренде", Href: `${base}/about?utm_source=yandex&utm_medium=cpc&utm_campaign=sitelink`, Description: "Ткани из Италии, пошив в Португалии и Литве" },
      ] }],
    });
    return idOf(r.AddResults, "Быстрые ссылки");
  } catch (e) {
    warnings.push(`Быстрые ссылки не добавлены: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

/** Фото для объявлений в сетях: первый кадр образа из public/images/brand/looks, ужатый до 1600 px. */
async function uploadLookImage(cfg: DirectConfig, warnings: string[]): Promise<string | undefined> {
  try {
    const sharp = (await import("sharp")).default;
    const file = path.join(process.cwd(), "public/images/brand/looks/look-01.jpg");
    const buf = await sharp(await readFile(file)).resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const r = await directCall<{ AddResults?: ActionResult[] }>(cfg, "adimages", "add", { AdImages: [{ ImageData: buf.toString("base64"), Name: "tr-look-01" }] });
    const errs = errorsOf(r.AddResults);
    if (errs.length) throw new Error(errs.join("; "));
    return r.AddResults?.[0]?.AdImageHash;
  } catch (e) {
    warnings.push(`Фото для ретаргетинга не загружено: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

function textCampaign(name: string, weeklyRub: number, negatives: string[], opts: { search: boolean; counter: number | null; goal: { id: number; valueRub: number } | null }) {
  const limit = { WeeklySpendLimit: toMicro(weeklyRub) };
  return {
    Name: name,
    StartDate: mskDate(),
    NegativeKeywords: negatives.length ? { Items: negatives } : undefined,
    TextCampaign: {
      BiddingStrategy: opts.search
        ? { Search: { BiddingStrategyType: "WB_MAXIMUM_CLICKS", WbMaximumClicks: limit }, Network: { BiddingStrategyType: "SERVING_OFF" } }
        : { Search: { BiddingStrategyType: "SERVING_OFF" }, Network: { BiddingStrategyType: "WB_MAXIMUM_CLICKS", WbMaximumClicks: limit } },
      Settings: [{ Option: "ADD_METRICA_TAG", Value: "YES" }, { Option: "ADD_OPENSTAT_TAG", Value: "NO" }],
      ...(opts.counter ? { CounterIds: { Items: [opts.counter] } } : {}),
      ...(opts.counter && opts.goal ? { PriorityGoals: { Items: [{ GoalId: opts.goal.id, Value: toMicro(opts.goal.valueRub) }] } } : {}),
    },
  };
}

/**
 * Создаёт стартовый набор кампаний в кабинете и записывает их в базу CRM. Все кампании сразу ставятся на паузу:
 * показы начнутся после «Запустить» в CRM и пополнения баланса. Ошибки одной кампании не отменяют остальные.
 */
export async function createStarterCampaigns(cfg: DirectConfig, input: StarterInput): Promise<StarterResult> {
  const out: StarterResult = { created: [], warnings: [], errors: [] };
  const base = (process.env.APP_URL ?? "https://tr-rodionova.ru").replace(/\/$/, "");
  const regionIds = [...new Set(input.regions.flatMap((r) => REGIONS[r]?.ids ?? []))];
  if (!regionIds.length) throw new Error("Выберите хотя бы один регион показа");
  const [categories, delivery, access] = await Promise.all([
    db.category.findMany({ where: { slug: { in: input.categories }, isActive: true }, include: { products: { where: { status: "ACTIVE" }, select: { price: true, material: true, name: true } } } }),
    getSetting("delivery"),
    metrikaAccess(),
  ]);
  // номера целей Метрики: заказ — для стратегий и отчётов, просмотр вещи — для ретаргетинга
  let goals: { order?: number; product_view?: number } = {};
  if (access?.token) {
    try {
      const g = await metrikaGoalIds({ ...access, token: access.token });
      goals = g.ids;
      const fixed = await ensureRetargetingFlag({ ...access, token: access.token }, g.goals);
      if (fixed.length) out.warnings.push(`В Метрике включён флаг «ретаргетинг» у целей: ${fixed.join(", ")}`);
    } catch (e) {
      out.warnings.push(`Цели Метрики не прочитаны: ${e instanceof Error ? e.message : e}`);
    }
  } else if (access) out.warnings.push("В интеграции Метрики нет OAuth-токена: кампании без приоритетной цели «заказ», ретаргетинг невозможен.");
  else out.warnings.push("Интеграция Метрики выключена: кампании без счётчика, конверсии в Директе считаться не будут.");
  const counter = access?.counter ?? null;
  const budget = splitBudget(input.monthlyBudgetRub, { brand: input.brand, retargeting: input.retargeting && !!goals.product_view, categories: categories.length });
  const sitelinks = await addSitelinks(cfg, base, out.warnings);
  const avgPrice = categories.flatMap((c) => c.products.map((p) => p.price));
  const aov = avgPrice.length ? avgPrice.reduce((s, p) => s + p, 0) / avgPrice.length : 30_000_00;
  const goal = goals.order ? { id: goals.order, valueRub: Math.round(aov / 100) } : null;
  const fitting = `Примерка курьером в Москве и СПб${delivery.freeFrom ? `, бесплатно от ${fmtRub(delivery.freeFrom)}` : ""}`;
  const created: { externalId: string; name: string; kind: string; category: string | null; weekly: number; utm: string }[] = [];

  const run = async (name: string, kind: string, fn: () => Promise<{ id: number; weekly: number; utm: string; category: string | null }>) => {
    try {
      const r = await fn();
      out.created.push({ name, id: r.id, kind });
      created.push({ externalId: String(r.id), name, kind, category: r.category, weekly: r.weekly, utm: r.utm });
    } catch (e) {
      out.errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  if (input.brand) {
    await run("TR · Бренд · Поиск", "brand_search", async () => {
      const utm = "direct-brand";
      const id = await addCampaign(cfg, textCampaign("TR · Бренд · Поиск", budget.brand, NEGATIVE_KEYWORDS, { search: true, counter, goal }), out.warnings);
      const group = await addGroup(cfg, id, "Бренд", regionIds);
      await addKeywords(cfg, group, ["t.rodionova", "trodionova", "tr rodionova", "t rodionova", "родионова одежда", "родионова бренд одежды", "татьяна родионова одежда", "tr rodionova одежда", "t.rodionova официальный сайт"], out.warnings);
      await addAds(cfg, group, [
        { Title: "T.Rodionova — официальный сайт бренда", Title2: "Женская одежда", Text: `Боди, брюки, юбки, жакеты и платья из натуральных тканей. ${fitting}.`, Href: utmHref(base, "/", utm, "&utm_term={keyword}") },
        { Title: "T.Rodionova — женская одежда", Title2: "Тираж до 60 вещей на модель", Text: `Шерсть из Бьеллы, шёлк из Комо, пошив в Португалии и Литве. ${fitting}.`, Href: utmHref(base, "/", utm, "&utm_term={keyword}") },
      ], sitelinks ? { SitelinkSetId: sitelinks } : {}, out.warnings);
      return { id, weekly: budget.brand, utm, category: null };
    });
  }

  for (const c of categories) {
    if (!c.products.length) {
      out.warnings.push(`«${c.name}»: в категории нет вещей в продаже, кампания не создана.`);
      continue;
    }
    const tpl = CATEGORY_TEMPLATES[c.slug] ?? { noun: c.name, keywords: [`${c.name.toLowerCase()} женские купить`, `${c.name.toLowerCase()} бренд`, `${c.name.toLowerCase()} премиум`, `дизайнерские ${c.name.toLowerCase()}`], features: [] };
    const name = `TR · ${c.name} · Поиск`;
    await run(name, "category_search", async () => {
      const utm = `direct-${c.slug}`;
      const minPrice = c.products.length ? Math.min(...c.products.map((p) => p.price)) : 0;
      const materials = [...new Set(c.products.map((p) => p.material && genitive(p.material)).filter((m): m is string => !!m))];
      const id = await addCampaign(cfg, textCampaign(name, budget.perCategory, NEGATIVE_KEYWORDS, { search: true, counter, goal }), out.warnings);
      const group = await addGroup(cfg, id, c.name, regionIds);
      await addKeywords(cfg, group, tpl.keywords, out.warnings);
      const priceTitle = minPrice ? `${tpl.noun} T.Rodionova — от ${fmtRub(minPrice)}` : `${tpl.noun} T.Rodionova`;
      const materialTitle = materials.length ? `${tpl.noun} из ${materials.length > 1 ? `${materials[0]} и ${materials[1]}` : materials[0]} — T.Rodionova` : `${tpl.noun} — российский бренд T.Rodionova`;
      await addAds(cfg, group, [
        { Title: priceTitle, Title2: "Примерка курьером", Text: `${tpl.features[0] ?? "Натуральные ткани, тираж до 60 вещей на модель"}. ${fitting}.`, Href: utmHref(base, `/catalog?category=${c.slug}`, utm, "&utm_term={keyword}") },
        { Title: materialTitle, Title2: "Пошив в Португалии и Литве", Text: `Цена не меняется в течение сезона${minPrice ? `, ${tpl.noun.toLowerCase()} от ${fmtRub(minPrice)}` : ""}. Примерка курьером в Москве и СПб.`, Href: utmHref(base, `/catalog?category=${c.slug}`, utm, "&utm_term={keyword}") },
      ], sitelinks ? { SitelinkSetId: sitelinks } : {}, out.warnings);
      return { id, weekly: budget.perCategory, utm, category: c.slug };
    });
  }

  if (input.retargeting && goals.product_view) {
    const name = "TR · Ретаргетинг · Сети";
    await run(name, "retargeting", async () => {
      const utm = "direct-retargeting";
      const id = await addCampaign(cfg, textCampaign(name, budget.retargeting, [], { search: false, counter, goal }), out.warnings);
      const group = await addGroup(cfg, id, "Смотрели вещь, не купили", regionIds);
      const rules = [{ Arguments: [{ MembershipLifeSpan: 30, ExternalId: goals.product_view }], Operator: "ANY" }, ...(goals.order ? [{ Arguments: [{ MembershipLifeSpan: 90, ExternalId: goals.order }], Operator: "NONE" }] : [])];
      const rl = await directCall<{ AddResults?: ActionResult[] }>(cfg, "retargetinglists", "add", { RetargetingLists: [{ Type: "RETARGETING", Name: "TR: смотрели вещь 30 дней, без заказа 90 дней", Rules: rules }] });
      const listId = idOf(rl.AddResults, "Условие ретаргетинга");
      const at = await directCall<{ AddResults?: ActionResult[] }>(cfg, "audiencetargets", "add", { AudienceTargets: [{ AdGroupId: group, RetargetingListId: listId }] });
      idOf(at.AddResults, "Аудитория группы");
      const image = await uploadLookImage(cfg, out.warnings);
      await addAds(cfg, group, [
        { Title: "Вещь T.Rodionova, которую вы смотрели", Title2: "Примерка курьером", Text: `Натуральные ткани, тираж до 60 вещей на модель. ${fitting}.`, Href: utmHref(base, "/catalog", utm) },
        { Title: "T.Rodionova: цена не меняется в сезоне", Title2: "Распродаж не бывает", Text: `Вернитесь к вещи, которую смотрели: шерсть из Бьеллы, шёлк из Комо. ${fitting}.`, Href: utmHref(base, "/catalog", utm) },
      ], { ...(sitelinks ? { SitelinkSetId: sitelinks } : {}), ...(image ? { AdImageHash: image } : {}) }, out.warnings);
      return { id, weekly: budget.retargeting, utm, category: null };
    });
  } else if (input.retargeting) out.warnings.push("Ретаргетинг пропущен: в Метрике нет цели product_view (нажмите «Проверить связь» в интеграции Метрики с OAuth-токеном).");

  // всё на паузу: владелец запускает из CRM, когда баланс пополнен и объявления прошли модерацию
  const ids = created.map((c) => Number(c.externalId));
  if (ids.length) {
    try {
      await suspendCampaigns(cfg, ids);
    } catch (e) {
      out.warnings.push(`Кампании созданы, но не поставлены на паузу: ${e instanceof Error ? e.message : e}. Они остановлены до модерации; проверьте состояние в таблице.`);
    }
  }
  for (const c of created) {
    await db.adCampaign.upsert({
      where: { provider_externalId: { provider: PROVIDER, externalId: c.externalId } },
      update: { name: c.name, kind: c.kind, category: c.category, managed: true, utmCampaign: c.utm, weeklyBudget: c.weekly * 100, plannedWeekly: c.weekly * 100, targetCpa: Math.round(input.targetCpaRub * 100), createdBy: input.actorId, strategy: "WB_MAXIMUM_CLICKS", state: "SUSPENDED", status: "DRAFT" },
      create: { provider: PROVIDER, externalId: c.externalId, name: c.name, kind: c.kind, category: c.category, managed: true, utmCampaign: c.utm, weeklyBudget: c.weekly * 100, plannedWeekly: c.weekly * 100, targetCpa: Math.round(input.targetCpaRub * 100), createdBy: input.actorId, strategy: "WB_MAXIMUM_CLICKS", state: "SUSPENDED", status: "DRAFT" },
    });
  }
  // реальные состояния из кабинета (новая кампания до модерации — OFF, пауза могла не примениться)
  if (created.length) await syncCampaigns(cfg).catch((e) => out.warnings.push(`Состояния кампаний не обновлены: ${e instanceof Error ? e.message : e}`));
  return out;
}
