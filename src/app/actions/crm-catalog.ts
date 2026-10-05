"use server";

import { revalidatePath } from "next/cache";
import { pingIndexNow } from "@/lib/indexnow";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { receiptStock, writeOffStock, adjustStock } from "@/lib/stock";
import { notifyWaitlist } from "@/lib/waitlist";
import { toKopecks } from "@/lib/money";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => ({ а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ProductSchema = z.object({
  name: z.string().trim().min(1, "Название"),
  sku: z.string().trim().min(1, "Артикул"),
  slug: z.string().trim().optional(),
  price: z.string().min(1, "Цена"),
  compareAt: z.string().optional(),
  costPrice: z.string().optional(),
  categoryId: z.string().optional(),
  collectionId: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  description: z.string().optional(),
  composition: z.string().optional(),
  care: z.string().optional(),
  madeIn: z.string().optional(),
  images: z.string().optional(),
});

export async function saveProductAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("products");
  const parsed = ProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const id = String(formData.get("id") ?? "");
  const data = {
    name: d.name,
    sku: d.sku.toUpperCase(),
    slug: d.slug ? slugify(d.slug) : slugify(d.name),
    price: toKopecks(d.price),
    compareAt: d.compareAt ? toKopecks(d.compareAt) : null,
    costPrice: d.costPrice ? toKopecks(d.costPrice) : null,
    categoryId: d.categoryId || null,
    collectionId: d.collectionId || null,
    status: d.status,
    description: d.description || null,
    composition: d.composition || null,
    care: d.care || null,
    madeIn: d.madeIn || null,
    isNew: formData.get("isNew") === "on",
    isFeatured: formData.get("isFeatured") === "on",
  };
  const images = (d.images ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  let productId = id;
  try {
    if (id) {
      await db.product.update({ where: { id }, data });
    } else {
      productId = (await db.product.create({ data })).id;
    }
    await db.productImage.deleteMany({ where: { productId } });
    if (images.length) await db.productImage.createMany({ data: images.map((url, i) => ({ productId, url, alt: data.name, order: i })) });
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg.includes("Unique") ? "Артикул или адрес страницы уже заняты" : msg };
  }
  await audit(me.id, id ? "product.update" : "product.create", "Product", productId, { name: data.name });
  revalidatePath("/crm/products");
  revalidatePath("/", "layout");
  // карточка вещи и каталог — поисковикам сразу (IndexNow), если интеграция включена; архив и черновик тоже: адрес пропал
  await pingIndexNow([`/product/${data.slug}`, "/catalog", "/yml.xml"]);
  if (!id) redirect(`/crm/products/${productId}`);
  return { ok: true, message: "Сохранено" };
}

export async function addVariantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("products");
  const productId = String(formData.get("productId"));
  const size = String(formData.get("size") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!size) return { error: "Укажите размер" };
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { _count: { select: { variants: true } } } });
  const qty = Number(formData.get("stock") ?? 0) || 0;
  try {
    const v = await db.productVariant.create({
      data: {
        productId,
        size,
        color,
        colorHex: String(formData.get("colorHex") ?? "").trim() || null,
        sku: String(formData.get("sku") ?? "").trim() || `${product.sku}-${String(product._count.variants + 1).padStart(2, "0")}`,
        barcode: String(formData.get("barcode") ?? "").trim() || null,
        price: String(formData.get("price") ?? "").trim() ? toKopecks(String(formData.get("price"))) : null,
      },
    });
    if (qty > 0) await db.$transaction((tx) => receiptStock(tx, v.id, qty, { unitCost: product.costPrice, reason: "Первичный приход", createdBy: me.id }));
  } catch (e) {
    return { error: errorMessage(e).includes("Unique") ? "Такой артикул варианта уже есть" : errorMessage(e) };
  }
  revalidatePath(`/crm/products/${productId}`);
  return { ok: true, message: "Вариант добавлен" };
}

export async function updateVariantAction(formData: FormData) {
  await requireSection("products");
  const id = String(formData.get("id"));
  const price = String(formData.get("price") ?? "").trim();
  const v = await db.productVariant.update({
    where: { id },
    data: { price: price ? toKopecks(price) : null, barcode: String(formData.get("barcode") ?? "").trim() || null, colorHex: String(formData.get("colorHex") ?? "").trim() || null },
  });
  revalidatePath(`/crm/products/${v.productId}`);
}

export async function stockOperationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("stock");
  const variantId = String(formData.get("variantId") ?? "");
  const op = String(formData.get("op"));
  const qty = Math.trunc(Number(formData.get("qty")));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!variantId) return { error: "Выберите позицию" };
  if (!Number.isFinite(qty) || qty < 0) return { error: "Неверное количество" };
  let notified = 0;
  try {
    await db.$transaction(async (tx) => {
      if (op === "receipt") {
        const unitCost = String(formData.get("unitCost") ?? "").trim();
        const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
        await receiptStock(tx, variantId, qty, { unitCost: unitCost ? toKopecks(unitCost) : v.product.costPrice, reason: reason || "Приход с производства", createdBy: me.id });
        if (formData.get("toLedger") === "on") {
          const cost = (unitCost ? toKopecks(unitCost) : v.product.costPrice ?? 0) * qty;
          if (cost > 0) await tx.ledgerEntry.create({ data: { type: "EXPENSE_PRODUCTION", amount: cost, category: "Пошив", comment: `Приход ${v.sku} × ${qty}`, createdBy: me.id } });
        }
      } else if (op === "writeoff") {
        if (!reason) throw new Error("Укажите причину списания");
        await writeOffStock(tx, variantId, qty, { reason, createdBy: me.id });
      } else if (op === "adjust") {
        await adjustStock(tx, variantId, qty, { reason: reason || "Инвентаризация", createdBy: me.id });
      } else throw new Error("Неизвестная операция");
      await audit(me.id, `stock.${op}`, "ProductVariant", variantId, { qty, reason }, tx);
    });
    if (op === "receipt" || op === "adjust") notified = await notifyWaitlist(variantId);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/crm/stock");
  revalidatePath("/crm", "layout");
  return { ok: true, message: notified ? `Готово. Уведомлено из листа ожидания: ${notified}` : "Готово" };
}

// ───────────── Категории и SEO-тексты ─────────────

const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Название"),
  slug: z.string().trim().optional(),
  order: z.coerce.number().int().min(0).optional(),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(200).optional(),
  seoText: z.string().optional(),
  faq: z.string().optional(),
});

export async function saveCategoryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("products");
  const parsed = CategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Проверьте поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  // пары «вопрос / ответ», разделённые пустой строкой
  const faq = (d.faq ?? "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length >= 2)
    .map((lines) => ({ q: lines[0], a: lines.slice(1).join(" ") }));
  const slug = d.slug ? d.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : undefined;
  try {
    await db.category.update({
      where: { id: d.id },
      data: { name: d.name, ...(slug ? { slug } : {}), ...(d.order !== undefined ? { order: d.order } : {}), seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, seoText: d.seoText?.replace(/\r/g, "").trim() || null, faq },
    });
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg.includes("Unique") ? "Категория с таким адресом уже есть" : msg };
  }
  await audit(me.id, "category.update", "Category", d.id, { name: d.name });
  revalidatePath("/crm/products/categories");
  revalidatePath("/", "layout");
  return { ok: true, message: "Сохранено" };
}
