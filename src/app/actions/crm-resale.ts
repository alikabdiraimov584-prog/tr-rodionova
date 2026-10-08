"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { addPoints } from "@/lib/loyalty";
import { receiptStock } from "@/lib/stock";
import { audit } from "@/lib/audit";
import { toKopecks } from "@/lib/money";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { RESALE_CONDITIONS } from "@/lib/resale";
import { notifyResale } from "@/lib/notifications";

function revalidate(id: string) {
  revalidatePath("/crm/resale");
  revalidatePath(`/crm/resale/${id}`);
  revalidatePath("/crm", "layout");
  revalidatePath("/account/resale");
}

/** Предложить клиентке сумму баллами: REQUESTED → OFFERED (можно скорректировать повторно, пока не принято). */
export async function offerResaleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("resale");
  const id = String(formData.get("id"));
  const points = Math.trunc(Number(formData.get("points")));
  const note = String(formData.get("managerNote") ?? "").trim();
  if (!Number.isFinite(points) || points <= 0) return { error: "Укажите количество баллов" };
  const r = await db.resaleRequest.findUnique({ where: { id } });
  if (!r) return { error: "Заявка не найдена" };
  if (r.status !== "REQUESTED" && r.status !== "OFFERED") return { error: "Предложение можно сделать только по новой заявке" };
  await db.resaleRequest.update({ where: { id }, data: { status: "OFFERED", offerPoints: points, managerNote: note || null } });
  await audit(staff.id, "resale.offer", "ResaleRequest", id, { points, from: r.status });
  void notifyResale(id, "RESALE_OFFERED");
  revalidate(id);
  return { ok: true, message: `Предложено ${points.toLocaleString("ru-RU")} баллов — клиентка получит письмо и увидит предложение в кабинете` };
}

export async function declineResaleAction(formData: FormData) {
  const staff = await requireSection("resale");
  const id = String(formData.get("id"));
  const note = String(formData.get("managerNote") ?? "").trim();
  const r = await db.resaleRequest.findUnique({ where: { id } });
  if (!r || !["REQUESTED", "OFFERED", "ACCEPTED"].includes(r.status)) return;
  await db.resaleRequest.update({ where: { id }, data: { status: "DECLINED", managerNote: note || r.managerNote } });
  await audit(staff.id, "resale.decline", "ResaleRequest", id, { from: r.status });
  void notifyResale(id, "RESALE_DECLINED");
  revalidate(id);
}

/** Вещь получена: начисляем баллы по предложению внутри транзакции. */
export async function receiveResaleAction(formData: FormData) {
  const staff = await requireSection("resale");
  const id = String(formData.get("id"));
  const r = await db.resaleRequest.findUnique({ where: { id }, include: { orderItem: { select: { productName: true, size: true } }, product: { select: { name: true } } } });
  if (!r || r.status !== "ACCEPTED" || !r.offerPoints) return;
  const name = r.orderItem ? `${r.orderItem.productName}, ${r.orderItem.size}` : r.product?.name ?? "вещь";
  await db.$transaction(async (tx) => {
    await addPoints(tx, r.userId, "EARN_MANUAL", r.offerPoints!, { comment: `Выкуп: ${name}`, createdBy: staff.id });
    await tx.resaleRequest.update({ where: { id }, data: { status: "RECEIVED" } });
    await audit(staff.id, "resale.receive", "ResaleRequest", id, { points: r.offerPoints, userId: r.userId }, tx);
  });
  void notifyResale(id, "RESALE_RECEIVED");
  revalidate(id);
  revalidatePath(`/crm/customers/${r.userId}`);
}

/** Выставить на витрину pre-loved: создаём товар-копию с одним вариантом и остатком 1. */
export async function listResaleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("resale");
  const id = String(formData.get("id"));
  const price = toKopecks(String(formData.get("price") ?? ""));
  const condition = String(formData.get("condition") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (price <= 0) return { error: "Укажите цену для витрины" };
  if (!RESALE_CONDITIONS.some((c) => c.value === condition)) return { error: "Укажите состояние" };
  const r = await db.resaleRequest.findUnique({
    where: { id },
    include: { orderItem: { include: { variant: { include: { product: { include: { images: { orderBy: { order: "asc" } } } } } } } }, product: { include: { images: { orderBy: { order: "asc" } } } } },
  });
  if (!r) return { error: "Заявка не найдена" };
  if (r.status !== "RECEIVED") return { error: "Выставить можно только полученную вещь" };
  const source = r.orderItem?.variant.product ?? r.product;
  if (!source) return { error: "У заявки нет исходного товара" };
  const size = r.orderItem?.size ?? r.orderItem?.variant.size ?? "ONE";
  const color = r.orderItem?.color ?? r.orderItem?.variant.color ?? null;
  const colorHex = r.orderItem?.variant.colorHex ?? null;
  const suffix = r.id.slice(-6).toUpperCase();
  try {
    const productId = await db.$transaction(async (tx) => {
      const sku = `${source.sku}-PL-${suffix}`;
      let slug = `${source.slug}-preloved-${suffix.toLowerCase()}`;
      if (await tx.product.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Date.now().toString(36)}`;
      // категория исходной вещи скрыта в CRM: pre-loved вещь ждёт её включения вместе с остальными
      const category = source.categoryId ? await tx.category.findUnique({ where: { id: source.categoryId }, select: { isActive: true } }) : null;
      const waits = !!category && !category.isActive;
      const p = await tx.product.create({
        data: {
          slug,
          sku,
          name: `${source.name} · pre-loved`,
          description: description || `Вещь из программы выкупа T.Rodionova. Состояние: ${condition}. ${r.description}`,
          composition: source.composition,
          care: source.care,
          madeIn: source.madeIn,
          price,
          compareAt: source.price > price ? source.price : null,
          status: waits ? "DRAFT" : "ACTIVE",
          hiddenWithCategory: waits,
          isPreloved: true,
          condition,
          material: source.material,
          sizeChart: source.sizeChart,
          categoryId: source.categoryId,
          collectionId: source.collectionId,
          images: { create: source.images.map((i) => ({ url: i.url, alt: i.alt, order: i.order })) },
        },
      });
      const v = await tx.productVariant.create({ data: { productId: p.id, sku: `${sku}-01`, size, color, colorHex, stock: 0 } });
      await receiptStock(tx, v.id, 1, { unitCost: r.offerPoints ? r.offerPoints * 100 : null, reason: `Выкуп: заявка ${r.id}`, createdBy: staff.id });
      await tx.resaleRequest.update({ where: { id }, data: { status: "LISTED", listedProductId: p.id } });
      await audit(staff.id, "resale.list", "ResaleRequest", id, { productId: p.id, price, condition }, tx);
      return p.id;
    });
    revalidate(id);
    revalidatePath("/preloved");
    revalidatePath("/crm/products");
    return { ok: true, message: `Товар выставлен на витрину (id ${productId})` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function soldResaleAction(formData: FormData) {
  const staff = await requireSection("resale");
  const id = String(formData.get("id"));
  const r = await db.resaleRequest.findUnique({ where: { id } });
  if (!r || r.status !== "LISTED") return;
  await db.resaleRequest.update({ where: { id }, data: { status: "SOLD" } });
  await audit(staff.id, "resale.sold", "ResaleRequest", id, { listedProductId: r.listedProductId });
  revalidate(id);
}
