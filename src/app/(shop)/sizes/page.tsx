import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/auth";
import { MEASURE_GUIDE, SIZE_CHARTS, SIZE_CHART_KEYS, recommendSize } from "@/lib/sizes";
import { Eyebrow, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Таблица размеров" };

export default async function SizesPage() {
  const user = await getCurrentCustomer();
  const hasMeasures = !!user && !!(user.bust || user.waist || user.hips);
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Размерный советник" title="Таблица размеров">
        Лекала бренда рассчитаны на рост 168–174 см. Если мерки попадают на границу — выбирайте больший размер: вещи T.Rodionova садятся свободно.
      </PageTitle>

      <section className="card mb-12 grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <Eyebrow>Ваши мерки</Eyebrow>
          {hasMeasures ? (
            <div className="mt-2 text-sm">
              {[user.bust && `грудь ${user.bust}`, user.waist && `талия ${user.waist}`, user.hips && `бёдра ${user.hips}`, user.height && `рост ${user.height}`].filter(Boolean).join(" · ")} см
              <ul className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
                {SIZE_CHART_KEYS.map((k) => {
                  const a = recommendSize(SIZE_CHARTS[k], user);
                  return (
                    <li key={k}>
                      {SIZE_CHARTS[k].title}: <span className="text-ink">{a ? a.size : "—"}</span>{a && a.fit !== "точно" ? ` (${a.fit})` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Сохраните обхваты груди, талии и бёдер — на странице каждой вещи мы подскажем ваш размер.</p>
          )}
        </div>
        <Link href={user ? "/account/profile" : "/login?next=/account/profile"} className={hasMeasures ? "btn-outline" : "btn-primary"}>
          {hasMeasures ? "Изменить мерки" : "Сохранить мерки в кабинете"}
        </Link>
      </section>

      <div className="space-y-12">
        {SIZE_CHART_KEYS.map((k) => {
          const chart = SIZE_CHARTS[k];
          return (
            <section key={k}>
              <h2 className="text-2xl">{chart.title}</h2>
              <p className="mt-1 text-sm text-muted">{chart.hint}</p>
              <div className="card mt-4 overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Размер</th>
                      <th className={chart.primary.includes("bust") ? "text-ink" : ""}>Грудь, см</th>
                      <th className={chart.primary.includes("waist") ? "text-ink" : ""}>Талия, см</th>
                      <th className={chart.primary.includes("hips") ? "text-ink" : ""}>Бёдра, см</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((r) => (
                      <tr key={r.size}>
                        <td className="serif text-base">{r.size}</td>
                        <td>{r.bust[0]}–{r.bust[1]}</td>
                        <td>{r.waist[0]}–{r.waist[1]}</td>
                        <td>{r.hips[0]}–{r.hips[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="text-2xl">Как снять мерки</h2>
        <p className="mt-1 text-sm text-muted">Понадобится сантиметровая лента. Измеряйте в тонком белье, стоя ровно, лента прилегает, но не давит.</p>
        <div className="mt-6 grid gap-6 text-sm md:grid-cols-2">
          {MEASURE_GUIDE.map((g, i) => (
            <div key={g.key} className="border-t border-line pt-4">
              <div className="eyebrow">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-1 text-lg">{g.label}</h3>
              <p className="mt-1 text-muted">{g.how}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/account/profile" : "/login?next=/account/profile"} className="btn-primary">Сохранить мерки в кабинете</Link>
          <Link href={user ? "/account/support?topic=stylist" : "/login?next=/account/support?topic=stylist"} className="btn-ghost">Сомневаетесь — запишитесь на примерку</Link>
        </div>
      </section>
    </div>
  );
}
