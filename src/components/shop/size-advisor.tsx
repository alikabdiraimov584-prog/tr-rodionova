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
  const advice = user ? recommendSize(chart, user) : null;
  if (!advice) {
    return (
      <div className="border border-dashed border-line px-4 py-3 text-xs text-muted">
        <Link href={user ? "/account/profile" : `/login?next=/product/${product.slug}`} className="underline underline-offset-4 hover:text-ink">
          Укажите мерки — подскажем размер
        </Link>
        {" · "}
        <Link href="/sizes" className="hover:text-ink">таблица размеров</Link>
      </div>
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
