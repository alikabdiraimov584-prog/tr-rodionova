import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { moderateReviewAction } from "@/app/actions/crm-marketing";
import { qs, str } from "@/components/crm/pager";

export const metadata: Metadata = { title: "Отзывы" };

export default async function Reviews({ searchParams }: PageProps<"/crm/reviews">) {
  await requireSection("reviews");
  const sp = await searchParams;
  const tab = str(sp.tab) ?? "pending";
  const reviews = await db.review.findMany({
    where: { isPublic: tab === "published" },
    include: { user: { select: { id: true, firstName: true, lastName: true } }, product: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageTitle title="Отзывы">После публикации клиентке начисляются баллы за отзыв (один раз).</PageTitle>
      <div className="mb-4 flex gap-2">
        {[["pending", "На модерации"], ["published", "Опубликованы"]].map(([k, v]) => (
          <Link key={k} href={qs("/crm/reviews", { tab: k })} className={`badge ${tab === k ? "border-ink bg-ink text-ivory" : "border-line bg-white"}`}>{v}</Link>
        ))}
      </div>
      {reviews.length === 0 ? (
        <Empty title="Отзывов нет" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reviews.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/product/${r.product.slug}`} target="_blank" className="text-sm underline">{r.product.name}</Link>
                  <div className="text-xs text-muted"><Link href={`/crm/customers/${r.user.id}`} className="underline">{r.user.firstName} {r.user.lastName}</Link> · {formatDate(r.createdAt)}</div>
                </div>
                <Badge tone={r.rating >= 4 ? "success" : r.rating === 3 ? "warning" : "danger"}>{"★".repeat(r.rating)}</Badge>
              </div>
              <p className="mt-3 text-sm">{r.text ?? <span className="text-muted">Без текста</span>}</p>
              <div className="mt-4 flex gap-3">
                <form action={moderateReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value={r.isPublic ? "hide" : "publish"} />
                  <SubmitButton className={r.isPublic ? "btn-outline btn-sm" : "btn-primary btn-sm"}>{r.isPublic ? "Скрыть" : "Опубликовать"}</SubmitButton>
                </form>
                <form action={moderateReviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="delete" />
                  <ConfirmButton message="Удалить отзыв безвозвратно?" className="text-xs text-muted hover:text-danger">Удалить</ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
