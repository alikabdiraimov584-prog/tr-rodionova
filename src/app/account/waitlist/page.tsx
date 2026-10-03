import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { unsubscribeStockAction } from "@/app/actions/waitlist";

export const metadata: Metadata = { title: "Лист ожидания" };

export default async function WaitlistPage() {
  const user = await requireUser("/account/waitlist");
  const subs = await db.stockSubscription.findMany({
    where: { userId: user.id },
    include: { variant: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageTitle title="Лист ожидания">Мы сообщим, когда нужный размер снова появится в наличии.</PageTitle>
      {subs.length === 0 ? (
        <Empty title="Список пуст" action={<Link href="/catalog" className="btn-primary">В каталог</Link>}>
          На странице товара выберите отсутствующий размер и нажмите «Сообщить о поступлении».
        </Empty>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {subs.map((s) => {
            const available = s.variant.stock - s.variant.reserved;
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <Link href={`/product/${s.variant.product.slug}`} className="text-sm">{s.variant.product.name}</Link>
                  <div className="text-xs text-muted">{s.variant.color} · {s.variant.size} · с {formatDate(s.createdAt)}</div>
                </div>
                <div className="flex items-center gap-4">
                  {available > 0 ? <Badge tone="success">В наличии</Badge> : <Badge>Ожидается</Badge>}
                  <form action={unsubscribeStockAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-[0.62rem] uppercase tracking-[0.18em] text-muted hover:text-danger">Удалить</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
