import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/auth";
import { MEASURE_GUIDE, recommendSize } from "@/lib/sizes";
import { SizeTable } from "@/components/shop/size-table";
import { Eyebrow, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Таблица размеров" };

export default async function SizesPage() {
  const user = await getCurrentCustomer();
  const hasMeasures = !!user && !!(user.bust || user.waist || user.hips);
  const advice = hasMeasures ? recommendSize(user) : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <PageTitle eyebrow="Размерный советник" title="Таблица размеров">
        Единая таблица мерок для всех вещей T.Rodionova.
      </PageTitle>

      <section className="card mb-12 grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <Eyebrow>Ваши мерки</Eyebrow>
          {hasMeasures ? (
            <div className="mt-2 text-sm">
              {[user.bust && `грудь ${user.bust}`, user.waist && `талия ${user.waist}`, user.hips && `бёдра ${user.hips}`, user.height && `рост ${user.height}`].filter(Boolean).join(" · ")} см
              {advice && <p className="mt-3 text-xs text-muted">{advice.note}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Сохраните обхваты груди, талии и бёдер — на странице каждой вещи мы подскажем ваш размер.</p>
          )}
        </div>
        <Link href={user ? "/account/profile" : "/login?next=/account/profile"} className={hasMeasures ? "btn-outline" : "btn-primary"}>
          {hasMeasures ? "Изменить мерки" : "Сохранить мерки в кабинете"}
        </Link>
      </section>

      <SizeTable />

      <section className="mt-16 border-t border-line pt-10">
        <h2>Как снять мерки</h2>
        <p className="mt-1 text-sm text-muted">Понадобится сантиметровая лента. Измеряйте в тонком белье, стоя ровно, лента прилегает, но не давит.</p>
        <div className="mt-6 grid gap-6 text-sm md:grid-cols-2">
          {MEASURE_GUIDE.map((g, i) => (
            <div key={g.key} className="border-t border-line pt-4">
              <div className="eyebrow">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-1">{g.label}</h3>
              <p className="mt-1 text-muted">{g.how}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/account/profile" : "/login?next=/account/profile"} className="btn-primary">Сохранить мерки в кабинете</Link>
          <Link href={user ? "/account/support" : "/login?next=/account/support"} className="btn-ghost">Помощь с выбором размера</Link>
        </div>
      </section>
    </div>
  );
}
