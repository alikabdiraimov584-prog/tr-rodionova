import "server-only";
import { db } from "@/lib/db";
import { activeIntegration } from "@/lib/integrations/store";

/**
 * Клиент API Яндекс Директа (JSON v5): кампании, группы, ключевые фразы, объявления, ретаргетинг, отчёты.
 * Токен и настройки вводит владелец в CRM → Интеграции → Реклама → Яндекс Директ; код их никогда не запрашивает.
 * Деньги в API — в микроединицах (1 ₽ = 1 000 000), в базе CRM — в копейках.
 */

export const PROVIDER = "yandex_direct";
const MICRO = 1_000_000;
/** Минимальный недельный бюджет автостратегии в Директе, ₽ */
export const MIN_WEEKLY_RUB = 300;

export type DirectConfig = {
  token: string;
  /** Логин рекламодателя для агентского доступа; для прямого аккаунта пуст */
  login: string | null;
  sandbox: boolean;
  /** Оптимизатор сам применяет безопасные изменения (пауза проигравших объявлений, минус-слова, бюджеты) */
  autopilot: boolean;
  /** Целевая стоимость заказа, копейки (0 — не задана) */
  targetCpa: number;
};

const YES = /^(да|yes|on|1|true|вкл)/i;

export function parseDirectConfig(config: Record<string, string>): DirectConfig | null {
  const token = (config.token ?? "").trim();
  if (!token) return null;
  return {
    token,
    login: (config.login ?? "").trim() || null,
    sandbox: YES.test(config.sandbox ?? ""),
    // автопилот включён, пока владелец явно не написал «нет»
    autopilot: !(config.autopilot ?? "").trim() || YES.test(config.autopilot),
    targetCpa: Math.round(Number((config.targetCpa ?? "").replace(/[^\d.,]/g, "").replace(",", ".")) * 100) || 0,
  };
}

/** Настройки включённой интеграции Директа или null, если не подключена. */
export async function directConfig(): Promise<DirectConfig | null> {
  const i = await activeIntegration(PROVIDER);
  return i ? parseDirectConfig(i.config) : null;
}

export class DirectError extends Error {
  constructor(public code: number, message: string, public detail = "") {
    super(detail ? `${message}: ${detail} (код ${code})` : `${message} (код ${code})`);
  }
}

/** Остаток баллов API за сутки по последнему ответу (заголовок Units: потрачено/осталось/лимит). */
let lastUnits: string | null = null;
export function directUnits() {
  return lastUnits;
}

function apiBase(cfg: DirectConfig) {
  // DIRECT_API_BASE — только для стенда: локальная заглушка API вместо Яндекса
  if (process.env.DIRECT_API_BASE) return process.env.DIRECT_API_BASE.replace(/\/$/, "");
  return cfg.sandbox ? "https://api-sandbox.direct.yandex.com/json/v5" : "https://api.direct.yandex.com/json/v5";
}

function headers(cfg: DirectConfig, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${cfg.token}`, "Accept-Language": "ru", "Content-Type": "application/json; charset=utf-8", ...(cfg.login ? { "Client-Login": cfg.login } : {}), ...extra };
}

type ApiError = { error_code: number; error_string: string; error_detail?: string; request_id?: string };

/** Вызов сервиса (campaigns, adgroups, ads, keywords, …): возвращает result или бросает DirectError. */
export async function directCall<T>(cfg: DirectConfig, service: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(`${apiBase(cfg)}/${service}`, { method: "POST", headers: headers(cfg), body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(60_000) });
  lastUnits = res.headers.get("Units") ?? lastUnits;
  let body: { result?: T; error?: ApiError };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new DirectError(res.status, `Директ ответил HTTP ${res.status} без JSON`);
  }
  if (body.error) throw new DirectError(body.error.error_code, body.error.error_string, body.error.error_detail);
  if (!res.ok) throw new DirectError(res.status, `Директ ответил HTTP ${res.status}`);
  return body.result as T;
}

/** Результат операций add/update/suspend/…: Id или ошибки по каждому элементу. */
export type ActionResult = { Id?: number; AdImageHash?: string; Warnings?: { Code: number; Message: string; Details?: string }[]; Errors?: { Code: number; Message: string; Details?: string }[] };

export function errorsOf(results: ActionResult[] | undefined): string[] {
  return (results ?? []).flatMap((r) => (r.Errors ?? []).map((e) => `${e.Message}${e.Details ? `: ${e.Details}` : ""} (код ${e.Code})`));
}

/** Первый Id из AddResults; при ошибке — исключение с текстом Директа. */
export function idOf(results: ActionResult[] | undefined, what: string): number {
  const errs = errorsOf(results);
  if (errs.length) throw new Error(`${what}: ${errs.join("; ")}`);
  const id = results?.[0]?.Id;
  if (!id) throw new Error(`${what}: Директ не вернул Id`);
  return id;
}

export const toMicro = (rub: number) => Math.round(rub * MICRO);

/** Ответы Директа содержат null в необязательных полях; в запросах null не принимается — убираем перед update. */
export function stripNulls<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripNulls) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)])) as T;
  return v;
}
export const fromMicroToKopecks = (micro: number | null | undefined) => (micro ? Math.round(micro / 10_000) : 0);

// ───────────────────────────── Кампании ─────────────────────────────

export type Strategy = { BiddingStrategyType: string } & Record<string, unknown>;

export type RemoteCampaign = {
  Id: number;
  Name: string;
  Type: string;
  State: string;
  Status: string;
  StatusPayment: string;
  StartDate: string;
  NegativeKeywords?: { Items: string[] } | null;
  TextCampaign?: { BiddingStrategy: { Search: Strategy; Network: Strategy }; CounterIds?: { Items: number[] } | null } | null;
  UnifiedCampaign?: { BiddingStrategy: { Search: Strategy; Network: Strategy }; CounterIds?: { Items: number[] } | null } | null;
};

const CAMPAIGN_FIELDS = ["Id", "Name", "Type", "State", "Status", "StatusPayment", "StartDate", "NegativeKeywords"];

export async function listRemoteCampaigns(cfg: DirectConfig, ids?: number[]): Promise<RemoteCampaign[]> {
  const params = { SelectionCriteria: ids ? { Ids: ids } : {}, FieldNames: CAMPAIGN_FIELDS, TextCampaignFieldNames: ["BiddingStrategy", "CounterIds"], Page: { Limit: 1000 } };
  try {
    const r = await directCall<{ Campaigns?: RemoteCampaign[] }>(cfg, "campaigns", "get", { ...params, UnifiedCampaignFieldNames: ["BiddingStrategy", "CounterIds"] });
    return r.Campaigns ?? [];
  } catch (e) {
    // кабинет без единых перфоманс-кампаний не знает этого параметра — читаем только текстово-графические
    if (!(e instanceof DirectError) || !/Unified/i.test(e.message)) throw e;
    const r = await directCall<{ Campaigns?: RemoteCampaign[] }>(cfg, "campaigns", "get", params);
    return r.Campaigns ?? [];
  }
}

/** Недельный лимит стратегии (микроединицы) и тип: ищется в Search, затем в Network. */
export function strategyOf(c: RemoteCampaign): { type: string; weeklyMicro: number | null; where: "Search" | "Network" | null } {
  const bs = c.TextCampaign?.BiddingStrategy ?? c.UnifiedCampaign?.BiddingStrategy;
  if (!bs) return { type: "—", weeklyMicro: null, where: null };
  for (const where of ["Search", "Network"] as const) {
    const s = bs[where];
    if (!s || s.BiddingStrategyType === "SERVING_OFF") continue;
    const inner = Object.values(s).find((v) => v && typeof v === "object") as Record<string, unknown> | undefined;
    const limit = inner && typeof inner.WeeklySpendLimit === "number" ? (inner.WeeklySpendLimit as number) : null;
    return { type: s.BiddingStrategyType, weeklyMicro: limit, where };
  }
  return { type: bs.Search.BiddingStrategyType, weeklyMicro: null, where: null };
}

/** Зеркало кампаний кабинета в базе CRM: новые добавляются как внешние, у известных обновляются состояние и бюджет. */
export async function syncCampaigns(cfg: DirectConfig) {
  const remote = await listRemoteCampaigns(cfg);
  const known = await db.adCampaign.findMany({ where: { provider: PROVIDER } });
  const seen = new Set<string>();
  for (const c of remote) {
    const ext = String(c.Id);
    seen.add(ext);
    const st = strategyOf(c);
    const data = { name: c.Name, state: c.State, status: c.Status, statusPayment: c.StatusPayment, strategy: st.type, weeklyBudget: st.weeklyMicro === null ? null : fromMicroToKopecks(st.weeklyMicro) };
    await db.adCampaign.upsert({ where: { provider_externalId: { provider: PROVIDER, externalId: ext } }, update: data, create: { provider: PROVIDER, externalId: ext, kind: "external", ...data } });
  }
  // кампании, удалённые в кабинете, остаются в базе с состоянием DELETED: статистика по ним не теряется
  const gone = known.filter((k) => !seen.has(k.externalId) && k.state !== "DELETED");
  if (gone.length) await db.adCampaign.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { state: "DELETED" } });
  return { total: remote.length, deleted: gone.length };
}

export async function suspendCampaigns(cfg: DirectConfig, ids: number[]) {
  const r = await directCall<{ SuspendResults?: ActionResult[] }>(cfg, "campaigns", "suspend", { SelectionCriteria: { Ids: ids } });
  const errs = errorsOf(r.SuspendResults);
  if (errs.length) throw new Error(errs.join("; "));
}

export async function resumeCampaigns(cfg: DirectConfig, ids: number[]) {
  const r = await directCall<{ ResumeResults?: ActionResult[] }>(cfg, "campaigns", "resume", { SelectionCriteria: { Ids: ids } });
  const errs = errorsOf(r.ResumeResults);
  if (errs.length) throw new Error(errs.join("; "));
}

/** Сменить недельный бюджет автостратегии: стратегия отправляется целиком, меняется только WeeklySpendLimit. */
export async function setWeeklyBudget(cfg: DirectConfig, campaignId: number, weeklyRub: number) {
  if (weeklyRub < MIN_WEEKLY_RUB) throw new Error(`Недельный бюджет в Директе не меньше ${MIN_WEEKLY_RUB} ₽`);
  const [c] = await listRemoteCampaigns(cfg, [campaignId]);
  if (!c) throw new Error("Кампания не найдена в кабинете");
  const kind = c.TextCampaign ? "TextCampaign" : c.UnifiedCampaign ? "UnifiedCampaign" : null;
  const bs = (c.TextCampaign ?? c.UnifiedCampaign)?.BiddingStrategy;
  if (!kind || !bs) throw new Error("У кампании этого типа бюджет через CRM не меняется");
  let changed = false;
  for (const where of ["Search", "Network"] as const) {
    const s = bs[where];
    for (const v of Object.values(s)) {
      if (v && typeof v === "object" && "WeeklySpendLimit" in (v as object)) {
        (v as Record<string, unknown>).WeeklySpendLimit = toMicro(weeklyRub);
        changed = true;
      }
    }
  }
  if (!changed) throw new Error(`Стратегия «${strategyOf(c).type}» без недельного бюджета: смените стратегию в Директе`);
  const r = await directCall<{ UpdateResults?: ActionResult[] }>(cfg, "campaigns", "update", { Campaigns: [{ Id: campaignId, [kind]: { BiddingStrategy: stripNulls(bs) } }] });
  const errs = errorsOf(r.UpdateResults);
  if (errs.length) throw new Error(errs.join("; "));
  await db.adCampaign.updateMany({ where: { provider: PROVIDER, externalId: String(campaignId) }, data: { weeklyBudget: Math.round(weeklyRub * 100) } });
}

/** Переключить поисковую кампанию на оплату за конверсии по цели (когда накоплено достаточно заказов). */
export async function switchToPayForConversion(cfg: DirectConfig, campaignId: number, goalId: number, cpaRub: number) {
  const [c] = await listRemoteCampaigns(cfg, [campaignId]);
  if (!c) throw new Error("Кампания не найдена в кабинете");
  const kind = c.TextCampaign ? "TextCampaign" : c.UnifiedCampaign ? "UnifiedCampaign" : null;
  const bs = (c.TextCampaign ?? c.UnifiedCampaign)?.BiddingStrategy;
  if (!kind || !bs) throw new Error("У кампании этого типа стратегия через CRM не меняется");
  const st = strategyOf(c);
  if (!st.where) throw new Error("Не найдена активная стратегия");
  const weekly = st.weeklyMicro ?? toMicro(Math.max(MIN_WEEKLY_RUB, cpaRub * 3));
  bs[st.where] = { BiddingStrategyType: "PAY_FOR_CONVERSION", PayForConversion: { Cpa: toMicro(cpaRub), GoalId: goalId, WeeklySpendLimit: Math.max(weekly, toMicro(cpaRub) * 3) } };
  const r = await directCall<{ UpdateResults?: ActionResult[] }>(cfg, "campaigns", "update", { Campaigns: [{ Id: campaignId, [kind]: { BiddingStrategy: stripNulls(bs) } }] });
  const errs = errorsOf(r.UpdateResults);
  if (errs.length) throw new Error(errs.join("; "));
}

/** Добавить минус-фразы к кампании (список в Директе заменяется целиком, поэтому сначала читается текущий). */
export async function addNegativeKeywords(cfg: DirectConfig, campaignId: number, words: string[]) {
  const [c] = await listRemoteCampaigns(cfg, [campaignId]);
  if (!c) throw new Error("Кампания не найдена в кабинете");
  const current = c.NegativeKeywords?.Items ?? [];
  const items = [...new Set([...current, ...words.map((w) => w.trim().toLowerCase()).filter(Boolean)])].slice(0, 2000);
  const r = await directCall<{ UpdateResults?: ActionResult[] }>(cfg, "campaigns", "update", { Campaigns: [{ Id: campaignId, NegativeKeywords: { Items: items } }] });
  const errs = errorsOf(r.UpdateResults);
  if (errs.length) throw new Error(errs.join("; "));
  return items.length - current.length;
}

// ───────────────────────────── Объявления ─────────────────────────────

export type RemoteAd = { Id: number; AdGroupId: number; CampaignId: number; State: string; Status: string; TextAd?: { Title: string; Title2?: string | null; Text: string } | null };

export async function listAds(cfg: DirectConfig, campaignIds: number[]): Promise<RemoteAd[]> {
  if (!campaignIds.length) return [];
  const r = await directCall<{ Ads?: RemoteAd[] }>(cfg, "ads", "get", {
    SelectionCriteria: { CampaignIds: campaignIds.slice(0, 10) },
    FieldNames: ["Id", "AdGroupId", "CampaignId", "State", "Status"],
    TextAdFieldNames: ["Title", "Title2", "Text"],
    Page: { Limit: 10000 },
  });
  return r.Ads ?? [];
}

export async function suspendAds(cfg: DirectConfig, ids: number[]) {
  const r = await directCall<{ SuspendResults?: ActionResult[] }>(cfg, "ads", "suspend", { SelectionCriteria: { Ids: ids } });
  const errs = errorsOf(r.SuspendResults);
  if (errs.length) throw new Error(errs.join("; "));
}

// ───────────────────────────── Отчёты ─────────────────────────────

/** Дата в часовом поясе Москвы (кабинеты Директа российских рекламодателей ведутся по Москве). */
export function mskDate(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export type ReportRow = Record<string, string>;

/**
 * Отчёт сервиса Reports в режиме auto: при 201/202 Директ формирует отчёт офлайн, повторяем запрос через retryIn.
 * Деньги — в рублях с НДС (returnMoneyInMicros=false, IncludeVAT=YES), как списываются с баланса.
 */
export async function directReport(cfg: DirectConfig, params: { ReportType: string; FieldNames: string[]; DateFrom: string; DateTo: string; Goals?: number[]; Filter?: unknown[] }, name: string): Promise<ReportRow[]> {
  const body = {
    params: {
      SelectionCriteria: { DateFrom: params.DateFrom, DateTo: params.DateTo, ...(params.Filter ? { Filter: params.Filter } : {}) },
      ...(params.Goals?.length ? { Goals: params.Goals.map(String), AttributionModels: ["LSC"] } : {}),
      FieldNames: params.FieldNames,
      ReportName: `tr-crm ${name} ${params.DateFrom}..${params.DateTo} ${Date.now()}`,
      ReportType: params.ReportType,
      DateRangeType: "CUSTOM_DATE",
      Format: "TSV",
      IncludeVAT: "YES",
      IncludeDiscount: "NO",
    },
  };
  const h = headers(cfg, { processingMode: "auto", returnMoneyInMicros: "false", skipReportHeader: "true", skipReportSummary: "true" });
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(`${apiBase(cfg)}/reports`, { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    lastUnits = res.headers.get("Units") ?? lastUnits;
    if (res.status === 200) return parseTsv(await res.text());
    if (res.status === 201 || res.status === 202) {
      const wait = Math.min(30, Math.max(2, Number(res.headers.get("retryIn") ?? 5)));
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    let err: { error?: ApiError } = {};
    try {
      err = (await res.json()) as typeof err;
    } catch {
      // ответ без JSON
    }
    if (err.error) throw new DirectError(err.error.error_code, err.error.error_string, err.error.error_detail);
    throw new DirectError(res.status, `Отчёт Директа: HTTP ${res.status}`);
  }
  throw new Error("Отчёт Директа не готов: попробуйте обновить статистику позже");
}

function parseTsv(text: string): ReportRow[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.length);
  if (lines.length < 2) return [];
  const cols = lines[0].split("\t");
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    const row: ReportRow = {};
    cols.forEach((c, i) => (row[c] = cells[i] ?? ""));
    return row;
  });
}

/** Числовые поля отчёта: "--" означает отсутствие данных. */
export const num = (v: string | undefined) => (v === undefined || v === "" || v === "--" ? 0 : Number(v.replace(",", ".")) || 0);
export const rubToKopecks = (v: string | undefined) => Math.round(num(v) * 100);
/** Сумма всех колонок конверсий: без параметра Goals это «Conversions», с ним — «Conversions_<цель>_<модель>». */
export const conversionsOf = (row: ReportRow) => Object.entries(row).filter(([k]) => k.startsWith("Conversions")).reduce((s, [, v]) => s + num(v), 0);

/** Дневная статистика кампаний за период в базу CRM (upsert по дню и кампании). */
export async function syncDailyStats(cfg: DirectConfig, from: string, to: string, goalId: number | null) {
  const rows = await directReport(cfg, { ReportType: "CAMPAIGN_PERFORMANCE_REPORT", FieldNames: ["Date", "CampaignId", "Impressions", "Clicks", "Cost", "Conversions"], DateFrom: from, DateTo: to, ...(goalId ? { Goals: [goalId] } : {}) }, "campaigns");
  let n = 0;
  for (const r of rows) {
    if (!r.CampaignId || !r.Date) continue;
    const date = new Date(`${r.Date}T00:00:00.000Z`);
    const data = { impressions: num(r.Impressions), clicks: num(r.Clicks), cost: rubToKopecks(r.Cost), conversions: conversionsOf(r) };
    await db.adStat.upsert({ where: { provider_campaignId_date: { provider: PROVIDER, campaignId: r.CampaignId, date } }, update: data, create: { provider: PROVIDER, campaignId: r.CampaignId, date, ...data } });
    n++;
  }
  return n;
}

/** Статистика по объявлениям за период (для A/B-тестов текстов), без сохранения. */
export async function adStats(cfg: DirectConfig, from: string, to: string, goalId: number | null) {
  const rows = await directReport(cfg, { ReportType: "AD_PERFORMANCE_REPORT", FieldNames: ["CampaignId", "AdGroupId", "AdId", "Impressions", "Clicks", "Cost", "Conversions"], DateFrom: from, DateTo: to, ...(goalId ? { Goals: [goalId] } : {}) }, "ads");
  return rows.map((r) => ({ campaignId: r.CampaignId, adGroupId: Number(r.AdGroupId), adId: Number(r.AdId), impressions: num(r.Impressions), clicks: num(r.Clicks), cost: rubToKopecks(r.Cost), conversions: conversionsOf(r) }));
}

/** Поисковые запросы за период (для минус-слов), без сохранения. */
export async function searchQueries(cfg: DirectConfig, from: string, to: string, goalId: number | null) {
  const rows = await directReport(cfg, { ReportType: "SEARCH_QUERY_PERFORMANCE_REPORT", FieldNames: ["CampaignId", "Query", "Impressions", "Clicks", "Cost", "Conversions"], DateFrom: from, DateTo: to, ...(goalId ? { Goals: [goalId] } : {}) }, "queries");
  return rows.map((r) => ({ campaignId: r.CampaignId, query: r.Query ?? "", impressions: num(r.Impressions), clicks: num(r.Clicks), cost: rubToKopecks(r.Cost), conversions: conversionsOf(r) })).filter((r) => r.query);
}

// ───────────────────────────── Аккаунт ─────────────────────────────

export type ClientInfo = { Login: string; ClientInfo?: string; Currency?: string; Restrictions?: { Element: string; Value: number }[]; OverdraftSumAvailable?: number };

export async function clientInfo(cfg: DirectConfig): Promise<ClientInfo> {
  const r = await directCall<{ Clients?: ClientInfo[] }>(cfg, "clients", "get", { FieldNames: ["Login", "ClientInfo", "Currency", "Restrictions", "OverdraftSumAvailable"] });
  const c = r.Clients?.[0];
  if (!c) throw new Error("Директ не вернул данные рекламодателя");
  return c;
}
