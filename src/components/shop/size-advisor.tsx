import Link from "next/link";
import { chartForProduct, recommendSize } from "@/lib/sizes";

type AdvisorProduct = { slug: string; sizeChart?: string | null; category?: { slug: string } | null };
type AdvisorUser = { height: number | null; bust: number | null; waist: number | null; hips: number | null } | null | undefined;

/**
 * Размерный советник на странице товара (серверный компонент).
 * С мерками — «Ваш размер: M» и пояснение, без мерок — ссылка на профиль.
 */
export function SizeAdvisor({ product, user }: { product: AdvisorProduct; user: AdvisorUser }) {
  const chart = chartForProduct(product);
  if (!chart) return null;
  // гостье подсказка «войдите и укажите мерки» в момент выбора размера только мешает: рядом есть «Таблица размеров»
  if (!user) return null;
  const advice = recommendSize(chart, user);
  if (!advice) {
    return (
      <p className="text-[0.78rem] text-muted">
        Не знаете размер?{" "}
        <Link href="/account/profile" className="text-ink underline underline-offset-4 hover:opacity-70">
          Укажите мерки — подскажем
        </Link>
      </p>
    );
  }
  const tone = advice.fit === "точно" ? "text-success" : advice.fit === "нужна примерка" ? "text-warning" : "text-ink";
  return (
    <div className="border border-line bg-sand/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          Ваш размер: <span className="serif text-xl">{advice.size}</span>
        </div>
        <span className={`text-[0.62rem] uppercase tracking-[0.18em] ${tone}`}>{advice.fit}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{advice.note}</p>
      <p className="mt-2 text-[0.62rem] uppercase tracking-[0.16em] text-muted">
        По меркам из <Link href="/account/profile" className="underline underline-offset-4 hover:text-ink">профиля</Link> · <Link href="/sizes" className="hover:text-ink">таблица {chart.title.toLowerCase()}</Link>
      </p>
    </div>
  );
}
