import type { Metadata } from "next";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { directConfig, directUnits, PROVIDER } from "@/lib/ads/direct";
import { adsByDay, adsOverview, campaignRows, dayUtc } from "@/lib/ads/reports";
import { loadOptimizerState } from "@/lib/ads/optimizer";
import { getIntegration } from "@/lib/integrations/store";
import { formatDate, formatMoney, pct } from "@/lib/money";
import { Badge, Eyebrow, PageTitle, Stat } from "@/components/ui";
import { BarChart } from "@/components/crm/charts";
import { ApplyButton, CampaignControls, LaunchAllButton, StarterForm, SyncButton } from "@/components/crm/ads-forms";
import { qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Реклама" };

const KIND: Record<string, string> = { brand_search: "Бренд · поиск", category_search: "Категория · поиск", retargeting: "Ретаргетинг · сети", external: "Создана в кабинете" };
const STATE: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  ON: { label: "показы идут", tone: "success" },
  SUSPENDED: { label: "на паузе", tone: "warning" },
  OFF: { label: "выключена", tone: "neutral" },
  ENDED: { label: "завершена", tone: "neutral" },
  ARCHIVED: { label: "в архиве", tone: "neutral" },
  DELETED: { label: "удалена в кабинете", tone: "neutral" },
};
const STATUS: Record<string, string> = { DRAFT: "черновик", MODERATION: "на модерации", ACCEPTED: "принята", REJECTED: "отклонена модерацией" };
const LEVEL: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = { auto: { label: "автопилот", tone: "success" }, approve: { label: "нужно подтверждение", tone: "warning" }, info: { label: "подсказка", tone: "neutral" } };

const mskDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export default async function AdsPage({ searchParams }: PageProps<"/crm/ads">) {
  const user = await requireSection("ads");
  const canEdit = can(user.role, "adsEdit");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(str(sp.days))) ? Number(str(sp.days)) : 30;
  // период по дням Москвы, как считает Директ; сегодня включительно
  const today = dayUtc(mskDay(new Date()));
  const to = new Date(today.getTime() + 86_400_000);
  const from = new Date(to.getTime() - days * 86_400_000);
  const p = { from, to };
  const [cfg, integration, rows, optimizer, categories] = await Promise.all([
    directConfig(),
    getIntegration(PROVIDER),
    campaignRows(p),
    loadOptimizerState(),
    db.category.findMany({ where: { isActive: true, parentId: null }, orderBy: { order: "asc" }, select: { slug: true, name: true, _count: { select: { products: { where: { status: "ACTIVE" } } } } } }),
  ]);
  const utms = rows.map((r) => r.utmCampaign).filter((u): u is string => !!u);
  const [ov, daily] = await Promise.all([adsOverview(p, rows), adsByDay(p, utms)]);
  const managed = rows.filter((r) => r.managed);
  const paused = managed.filter((r) => r.state === "SUSPENDED").length;
  // деньги в копейках: деления округляются, иначе formatMoney получает дробные копейки
  const cpc = ov.clicks ? Math.round(ov.cost / ov.clicks) : 0;
  const cac = ov.orders ? Math.round(ov.cost / ov.orders) : 0;
  // подписи дней на графике: при длинном периоде каждая пятая, иначе они наезжают друг на друга
  const every = Math.max(1, Math.ceil(days / 7));
  const label = (d: { label: string }, i: number) => (i % every === 0 ? d.label : "");
  const drr = ov.revenue ? (ov.cost / ov.revenue) * 100 : 0;
  const units = directUnits();
  const lastStat = await db.adStat.findFirst({ where: { provider: PROVIDER }, orderBy: { date: "desc" }, select: { date: true } });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Реклама · Яндекс Директ"
        actions={[7, 30, 90].map((d) => <Link key={d} href={qs("/crm/ads", { days: d })} className={`btn btn-sm ${days === d ? "bg-ink text-ivory" : "border border-line"}`}>{d} дн.</Link>)}
      >
        CRM ведёт кабинет сама: создаёт кампании по категориям каталога, останавливает проигравшие тексты, добавляет минус-слова, двигает бюджеты к целевой стоимости заказа. Заказы привязаны к кампании по utm-метке визита, поэтому CAC и ДРР — по реальным оплатам.
      </PageTitle>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {cfg ? <Badge tone={integration?.lastCheckOk === false ? "danger" : "success"}>{cfg.sandbox ? "песочница подключена" : "кабинет подключён"}</Badge> : <Badge tone="warning">не подключено</Badge>}
          {cfg && <Badge tone={cfg.autopilot ? "success" : "neutral"}>автопилот {cfg.autopilot ? "включён" : "выключен"}</Badge>}
          {cfg && <span className="text-muted">цель {cfg.targetCpa ? `${formatMoney(cfg.targetCpa)} за заказ` : "не задана"}</span>}
          {lastStat && <span className="text-muted">· статистика по {formatDate(lastStat.date)}</span>}
          {units && <span className="text-muted">· баллы API {units}</span>}
          {integration?.lastError && <span className="text-danger">· {integration.lastError}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/crm/integrations" className="btn-outline btn-sm">Интеграция →</Link>
          {cfg && <SyncButton />}
          {cfg && canEdit && managed.length > 0 && <LaunchAllButton count={paused} />}
        </div>
      </div>

      {!cfg && (
        <div className="card space-y-3 p-5 text-sm">
          <Eyebrow>Как подключить</Eyebrow>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Кабинет Директа под логином владельца: <span className="font-mono text-xs">direct.yandex.ru</span>. В нём Инструменты → API → подать заявку на доступ к API (одобряют за 1–2 дня).</li>
            <li>OAuth-токен с правом «Яндекс Директ: использование API» (подробная подсказка под полем в интеграции). Токен вводится только в CRM → Интеграции → Реклама, никому не пересылается.</li>
            <li>Там же задать целевую стоимость заказа и включить интеграцию. Доступ логина Директа к счётчику Метрики даёт ретаргетинг и оплату за конверсии.</li>
            <li>Вернуться сюда: создать стартовый набор кампаний (они встанут на паузу), пополнить баланс в Директе и нажать «Запустить».</li>
          </ol>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Расход" value={formatMoney(ov.cost)} hint={ov.prevCost ? `${ov.cost >= ov.prevCost ? "+" : ""}${pct(ov.cost - ov.prevCost, ov.prevCost)}% к пред. периоду` : "с НДС, как списано с баланса"} />
        <Stat label="Клики" value={ov.clicks} hint={ov.impressions ? `CTR ${(100 * ov.clicks / ov.impressions).toFixed(2)}% · ${ov.impressions} показов` : undefined} />
        <Stat label="Цена клика" value={cpc ? formatMoney(cpc) : "—"} />
        <Stat label="Заказы из Директа" value={ov.orders} hint={ov.conversions ? `конверсий по Метрике: ${ov.conversions}` : "оплаченные, по utm визита"} />
        <Stat label="Стоимость заказа (CAC)" value={cac ? formatMoney(cac) : "—"} tone={cfg?.targetCpa && cac ? (cac <= cfg.targetCpa ? "success" : "danger") : undefined} hint={cfg?.targetCpa ? `цель ${formatMoney(cfg.targetCpa)}` : undefined} />
        <Stat label="ДРР" value={ov.revenue ? `${drr.toFixed(1)}%` : "—"} hint={ov.revenue ? `выручка ${formatMoney(ov.revenue)}` : "доля рекламных расходов в выручке"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card min-w-0 p-5">
          <Eyebrow>Расход по дням</Eyebrow>
          <div className="mt-4"><BarChart data={daily.map((d, i) => ({ label: label(d, i), value: d.cost }))} /></div>
        </div>
        <div className="card min-w-0 p-5">
          <Eyebrow>Клики и заказы по дням</Eyebrow>
          <div className="mt-4"><BarChart money={false} data={daily.map((d, i) => ({ label: label(d, i), value: d.clicks, sub: d.orders }))} /></div>
          <div className="mt-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-2 w-2 bg-taupe" />клики</span><span><span className="mr-1 inline-block h-2 w-2 bg-champagne" />заказы</span></div>
        </div>
      </div>

      <div className="card overflow-x-auto" tabIndex={0}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-2">
          <Eyebrow>Кампании</Eyebrow>
          <span className="text-xs text-muted">Бюджет недельный, как в стратегии Директа · расход, клики и заказы за выбранный период</span>
        </div>
        <table className="table">
          <thead><tr><th>Кампания</th><th>Состояние</th><th className="text-right">Бюджет/нед</th><th className="text-right">Расход</th><th className="text-right">Клики</th><th className="text-right">CPC</th><th className="text-right">CTR</th><th className="text-right">Конв.</th><th className="text-right">Заказы</th><th className="text-right">CAC</th><th className="text-right">ДРР</th>{canEdit && <th>Управление</th>}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = STATE[r.state ?? ""] ?? { label: r.state ?? "—", tone: "neutral" as const };
              const rcac = r.orders ? Math.round(r.cost / r.orders) : 0;
              return (
                <tr key={r.id}>
                  <td className="max-w-xs">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted">{KIND[r.kind] ?? r.kind}{r.utmCampaign ? ` · ${r.utmCampaign}` : ""} · №{r.externalId}</div>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {r.status && r.status !== "ACCEPTED" && <div className="mt-1 text-muted">{STATUS[r.status] ?? r.status}</div>}
                    {r.statusPayment === "DISALLOWED" && <div className="mt-1 text-danger">нет средств на балансе</div>}
                    {r.strategy && <div className="mt-1 text-muted">{r.strategy === "WB_MAXIMUM_CLICKS" ? "максимум кликов" : r.strategy === "PAY_FOR_CONVERSION" ? "оплата за конверсии" : r.strategy}</div>}
                  </td>
                  <td className="whitespace-nowrap text-right">{r.weeklyBudget ? formatMoney(r.weeklyBudget) : "—"}</td>
                  <td className="whitespace-nowrap text-right">{r.cost ? formatMoney(r.cost) : "—"}</td>
                  <td className="text-right">{r.clicks || "—"}</td>
                  <td className="whitespace-nowrap text-right text-muted">{r.clicks ? formatMoney(Math.round(r.cost / r.clicks)) : "—"}</td>
                  <td className="text-right text-muted">{r.impressions ? `${(100 * r.clicks / r.impressions).toFixed(2)}%` : "—"}</td>
                  <td className="text-right">{r.conversions || "—"}</td>
                  <td className="text-right">{r.orders || "—"}</td>
                  <td className={`whitespace-nowrap text-right ${rcac && r.targetCpa ? (rcac <= r.targetCpa ? "text-success" : "text-danger") : ""}`}>{rcac ? formatMoney(rcac) : "—"}</td>
                  <td className="text-right text-muted">{r.revenue ? `${((r.cost / r.revenue) * 100).toFixed(1)}%` : "—"}</td>
                  {canEdit && <td><CampaignControls campaignId={Number(r.externalId)} state={r.state} weeklyRub={r.weeklyBudget ? Math.round(r.weeklyBudget / 100) : null} canEdit={!!cfg && r.state !== "DELETED"} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">{cfg ? "Кампаний пока нет: создайте стартовый набор ниже или нажмите «Обновить статистику», чтобы подтянуть кампании из кабинета." : "Подключите кабинет, и здесь появятся кампании."}</p>}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Оптимизатор</Eyebrow>
            {optimizer && <span className="text-xs text-muted">прогон {formatDate(optimizer.ranAt, true)} · окно {optimizer.days} дн.</span>}
          </div>
          {!optimizer || optimizer.recommendations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{optimizer ? "Рекомендаций нет: данных пока мало или всё в пределах цели." : "Запускается каждую ночь после загрузки статистики и по кнопке «Обновить статистику»."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {optimizer.recommendations.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={LEVEL[r.level]?.tone ?? "neutral"}>{LEVEL[r.level]?.label ?? r.level}</Badge><span className="text-xs text-muted">{r.campaign}</span></div>
                    <div className="mt-1 font-medium">{r.title}</div>
                    <div className="text-xs text-muted">{r.why}</div>
                    {r.appliedAt && <div className="mt-1 text-xs text-success">Применено {formatDate(r.appliedAt, true)}: {r.result}</div>}
                    {!r.appliedAt && r.result && <div className="mt-1 text-xs text-danger">{r.result}</div>}
                  </div>
                  {r.action && !r.appliedAt && canEdit && cfg && <ApplyButton id={r.id} />}
                </li>
              ))}
            </ul>
          )}
          {optimizer?.errors.length ? <p className="mt-3 text-xs text-danger">{optimizer.errors.join("; ")}</p> : null}
        </div>
        <div className="card overflow-x-auto p-5" tabIndex={0}>
          <Eyebrow>A/B-тесты текстов</Eyebrow>
          {!optimizer || optimizer.tests.length === 0 ? (
            <p className="mt-3 text-sm text-muted">В каждой группе два варианта объявления. Когда у обоих набирается по 500 показов и у лидера 15 кликов, вариант с CTR ниже на 40 % и более останавливается.</p>
          ) : (
            <table className="table mt-3">
              <thead><tr><th>Кампания · вариант</th><th className="text-right">Показы</th><th className="text-right">Клики</th><th className="text-right">CTR</th><th className="text-right">Конв.</th><th>Итог</th></tr></thead>
              <tbody>
                {optimizer.tests.flatMap((t) => t.variants.map((v, i) => (
                  <tr key={`${t.adGroupId}-${v.adId}`} className={v.state !== "ON" ? "opacity-50" : ""}>
                    <td className="max-w-xs"><div className="text-xs text-muted">{i === 0 ? t.campaign : ""}</div><div className="truncate">{v.title}</div></td>
                    <td className="text-right">{v.impressions}</td>
                    <td className="text-right">{v.clicks}</td>
                    <td className="text-right">{(100 * v.ctr).toFixed(2)}%</td>
                    <td className="text-right">{v.conversions || "—"}</td>
                    <td className="text-xs text-muted">{i === 0 ? t.verdict : v.state !== "ON" ? "остановлен" : ""}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {cfg && canEdit && (
        <div className="card space-y-4 p-5">
          <div>
            <Eyebrow>Стартовый набор кампаний</Eyebrow>
            <p className="mt-1 text-xs text-muted">Поиск по бренду, поиск по категориям каталога (фразы и два текста на категорию, цены и ткани из карточек), ретаргетинг в сетях на тех, кто смотрел вещь и не купил за 30 дней. Стратегия «максимум кликов» с недельным бюджетом; при 10+ заказах оптимизатор предложит оплату за конверсии. Все кампании создаются на паузе.</p>
          </div>
          <StarterForm categories={categories.map((c) => ({ slug: c.slug, name: c.name, count: c._count.products }))} defaultCpa={cfg.targetCpa ? Math.round(cfg.targetCpa / 100) : 9000} defaultBudget={60_000} />
        </div>
      )}

      <div className="card p-5 text-sm">
        <Eyebrow>Как работает управление</Eyebrow>
        <ul className="mt-3 space-y-1.5 text-muted">
          <li><span className="text-ink">Каждую ночь:</span> статистика за 7 дней из отчётов Директа, зеркало кампаний, затем оптимизатор; по кнопке «Обновить статистику» — за 30 дней.</li>
          <li><span className="text-ink">Автопилот применяет:</span> остановку проигравшего варианта текста, минус-фразы по нецелевым запросам (выкройки, детское, маркетплейсы), снижение бюджета на 30 % у кампании, которая потратила три целевых CPA без заказов, остановку при шести, повышение на 25 % у кампании с CAC ниже 70 % цели и тремя и более заказами (не выше ×1,5 от плана).</li>
          <li><span className="text-ink">Ждут подтверждения:</span> остановка брендовой кампании, переход на оплату за конверсии, минус-фразы с кликами, но без явных стоп-слов.</li>
          <li><span className="text-ink">Деньги:</span> баланс пополняется только в кабинете Директа; CRM не имеет доступа к платежам. Кампании без средств показывают «нет средств на балансе».</li>
        </ul>
      </div>
    </div>
  );
}
