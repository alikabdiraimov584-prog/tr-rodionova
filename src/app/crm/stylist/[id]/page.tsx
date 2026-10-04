import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/money";
import { SELECTION_STATUS } from "@/lib/labels";
import { SIZE_CHARTS, SIZE_CHART_KEYS, recommendSize } from "@/lib/sizes";
import { Badge, Eyebrow, PageTitle } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/form";
import { AddItemForm, SelectionForm } from "@/components/crm/stylist-forms";
import { archiveSelectionAction, moveSelectionItemAction, removeSelectionItemAction, sendSelectionAction } from "@/app/actions/crm-stylist";

const customerSelect = { id: true, firstName: true, lastName: true, email: true, preferredSize: true, height: true, bust: true, waist: true, hips: true, loyaltyTier: { select: { name: true } } } as const;

function CustomerCard({ c }: { c: { id: string; firstName: string; lastName: string | null; email: string; preferredSize: string | null; height: number | null; bust: number | null; waist: number | null; hips: number | null; loyaltyTier: { name: string } | null } }) {
  const hasMeasures = !!(c.bust || c.waist || c.hips);
  return (
    <div className="card p-5 text-sm">
      <Eyebrow>Клиентка</Eyebrow>
      <div className="mt-2"><Link href={`/crm/customers/${c.id}`} className="underline">{c.firstName} {c.lastName}</Link> · {c.loyaltyTier?.name ?? "—"}</div>
      <div className="text-xs text-muted">{c.email} · размер в профиле: {c.preferredSize ?? "—"}</div>
      {hasMeasures ? (
        <div className="mt-3 text-xs text-muted">
          Мерки: {[c.bust && `грудь ${c.bust}`, c.waist && `талия ${c.waist}`, c.hips && `бёдра ${c.hips}`, c.height && `рост ${c.height}`].filter(Boolean).join(", ")} см
          <div className="mt-1">
            {SIZE_CHART_KEYS.map((k) => {
              const a = recommendSize(SIZE_CHARTS[k], c);
              return a ? <span key={k} className="mr-3">{SIZE_CHARTS[k].title.toLowerCase()}: <span className="text-ink">{a.size}</span></span> : null;
            })}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted">Мерок нет — попросите клиентку заполнить их в профиле.</div>
      )}
    </div>
  );
}

export default async function SelectionPage({ params, searchParams }: PageProps<"/crm/stylist/[id]">) {
  await requireSection("stylist");
  const { id } = await params;
  const sp = await searchParams;

  if (id === "new") {
    const customerId = typeof sp.customer === "string" ? sp.customer : "";
    if (!customerId) redirect("/crm/stylist");
    const c = await db.user.findFirst({ where: { id: customerId, role: "CUSTOMER" }, select: customerSelect });
    if (!c) notFound();
    return (
      <div className="space-y-6">
        <PageTitle eyebrow="Стилист онлайн" title="Новая подборка"><Link href="/crm/stylist" className="underline">← Все подборки</Link></PageTitle>
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="card p-5"><SelectionForm customerId={c.id} /></div>
          <CustomerCard c={c} />
        </div>
      </div>
    );
  }

  const s = await db.selection.findUnique({
    where: { id },
    include: {
      user: { select: customerSelect },
      stylist: { select: { firstName: true } },
      items: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { product: { include: { images: { orderBy: { order: "asc" }, take: 1 }, variants: true } } } },
    },
  });
  if (!s) notFound();
  const editable = s.status !== "ARCHIVED";
  const products = editable
    ? await db.product.findMany({
        where: { status: "ACTIVE", id: { notIn: s.items.map((i) => i.productId) } },
        select: { id: true, name: true, price: true, variants: { select: { id: true, size: true, color: true, stock: true, reserved: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  const st = SELECTION_STATUS[s.status];
  return (
    <div className="space-y-6">
      <PageTitle eyebrow={`Подборка · ${s.stylist?.firstName ?? "стилист"} · ${formatDate(s.createdAt)}`} title={s.title} actions={<Badge tone={st.tone}>{st.label}</Badge>}>
        <Link href="/crm/stylist" className="underline">← Все подборки</Link>
        {s.sentAt && ` · отправлена ${formatDate(s.sentAt, true)}`}
        {s.viewedAt && ` · просмотрена ${formatDate(s.viewedAt, true)}`}
      </PageTitle>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="card">
            <div className="p-4 pb-0"><Eyebrow>Вещи · {s.items.length}</Eyebrow></div>
            {s.items.length === 0 ? (
              <p className="p-4 text-sm text-muted">Добавьте вещи из каталога — форма справа.</p>
            ) : (
              <div className="divide-y divide-line">
                {s.items.map((it, idx) => {
                  const v = it.product.variants.find((x) => x.id === it.variantId);
                  const img = it.product.images[0];
                  return (
                    <div key={it.id} className="flex items-center gap-4 p-4 text-sm">
                      <div className="relative h-20 w-16 shrink-0 bg-sand">{img && <Image src={img.url} alt={img.alt ?? it.product.name} fill unoptimized sizes="64px" className="object-cover" />}</div>
                      <div className="min-w-0 flex-1">
                        <div><Link href={`/product/${it.product.slug}`} target="_blank" className="underline">{it.product.name}</Link> <span className="text-muted">· {formatMoney(it.product.price)}</span></div>
                        <div className="text-xs text-muted">
                          Размер: {v ? `${v.size}${v.color ? `, ${v.color}` : ""}${v.stock - v.reserved <= 0 ? " — нет в наличии" : ""}` : "без рекомендации"}
                        </div>
                        {it.comment && <div className="mt-1 text-xs">{it.comment}</div>}
                      </div>
                      {editable && (
                        <div className="flex shrink-0 items-center gap-2 text-xs">
                          <form action={moveSelectionItemAction}><input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="dir" value="up" /><button className="btn-ghost btn-sm" disabled={idx === 0} title="Выше">↑</button></form>
                          <form action={moveSelectionItemAction}><input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="dir" value="down" /><button className="btn-ghost btn-sm" disabled={idx === s.items.length - 1} title="Ниже">↓</button></form>
                          <form action={removeSelectionItemAction}><input type="hidden" name="itemId" value={it.id} /><ConfirmButton className="text-muted hover:text-danger" message="Убрать вещь из подборки?">Убрать</ConfirmButton></form>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {editable && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Название и записка</Eyebrow>
              <SelectionForm selection={{ id: s.id, title: s.title, note: s.note }} />
            </div>
          )}
          {!editable && s.note && <div className="card p-5 text-sm"><Eyebrow>Записка</Eyebrow><p className="mt-2 whitespace-pre-wrap">{s.note}</p></div>}
        </div>

        <aside className="space-y-6">
          <CustomerCard c={s.user} />
          {editable && (
            <div className="card p-5">
              <Eyebrow className="mb-3">Добавить вещь</Eyebrow>
              <AddItemForm
                selectionId={s.id}
                preferredSize={s.user.preferredSize}
                products={products.map((p) => ({ id: p.id, name: p.name, price: formatMoney(p.price), variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, available: v.stock - v.reserved })) }))}
              />
            </div>
          )}
          <div className="card space-y-3 p-5">
            <Eyebrow>Действия</Eyebrow>
            {(s.status === "DRAFT" || s.status === "ARCHIVED") && (
              <form action={sendSelectionAction}>
                <input type="hidden" name="id" value={s.id} />
                <SubmitButton className="btn-primary btn-sm">{s.status === "ARCHIVED" ? "Отправить повторно" : "Отправить клиентке"}</SubmitButton>
                {s.items.length === 0 && <p className="mt-1 text-xs text-muted">Сначала добавьте хотя бы одну вещь.</p>}
              </form>
            )}
            {(s.status === "SENT" || s.status === "VIEWED") && <p className="text-xs text-muted">Клиентка видит подборку в кабинете: /account/stylist/{s.id}. Изменения появляются у неё сразу.</p>}
            {s.status !== "ARCHIVED" && (
              <form action={archiveSelectionAction}>
                <input type="hidden" name="id" value={s.id} />
                <ConfirmButton className="btn-outline btn-sm" message="Убрать подборку в архив? Клиентка перестанет её видеть.">В архив</ConfirmButton>
              </form>
            )}
            {s.status === "ARCHIVED" && <p className="text-xs text-muted">Подборка в архиве. Чтобы изменить, отправьте её повторно — она снова станет доступна клиентке.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
