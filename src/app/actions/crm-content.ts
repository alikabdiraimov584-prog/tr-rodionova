"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => ({ а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function revalidateContent() {
  revalidatePath("/crm/content", "layout");
  revalidatePath("/lookbook", "layout");
  revalidatePath("/journal", "layout");
  revalidatePath("/");
}

// ───────────── Лукбук ─────────────

const LookSchema = z.object({
  title: z.string().trim().min(1, "Название"),
  slug: z.string().trim().optional(),
  season: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  coverUrl: z.string().trim().optional(),
  order: z.coerce.number().int().min(0).optional(),
});

export async function saveLookAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("content");
  const parsed = LookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const id = String(formData.get("id") ?? "");
  const data = {
    title: d.title,
    slug: d.slug ? slugify(d.slug) : slugify(d.title),
    season: d.season || null,
    description: d.description || null,
    coverUrl: d.coverUrl || null,
    order: d.order ?? 0,
    isPublished: formData.get("isPublished") === "on",
  };
  if (!data.slug) return { error: "Не удалось составить адрес страницы — укажите его латиницей" };
  let lookId = id;
  try {
    if (id) await db.look.update({ where: { id }, data });
    else lookId = (await db.look.create({ data })).id;
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg.includes("Unique") ? "Образ с таким адресом страницы уже есть" : msg };
  }
  await audit(me.id, id ? "look.update" : "look.create", "Look", lookId, { title: data.title, slug: data.slug });
  revalidateContent();
  if (!id) redirect(`/crm/content/looks/${lookId}`);
  return { ok: true, message: "Сохранено" };
}

export async function addLookItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("content");
  const lookId = String(formData.get("lookId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!lookId || !productId) return { error: "Выберите товар" };
  const look = await db.look.findUnique({ where: { id: lookId }, include: { _count: { select: { items: true } } } });
  if (!look) return { error: "Образ не найден" };
  const exists = await db.lookItem.findUnique({ where: { lookId_productId: { lookId, productId } } });
  if (exists) return { error: "Этот товар уже есть в образе" };
  const item = await db.lookItem.create({ data: { lookId, productId, note, order: look._count.items } });
  await audit(me.id, "look.addItem", "Look", lookId, { productId, itemId: item.id });
  revalidateContent();
  return { ok: true, message: "Товар добавлен" };
}

export async function updateLookItemAction(formData: FormData) {
  const me = await requireSection("content");
  const id = String(formData.get("id") ?? "");
  const order = Math.max(0, Math.trunc(Number(formData.get("order") ?? 0)) || 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  const item = await db.lookItem.update({ where: { id }, data: { order, note } });
  await audit(me.id, "look.updateItem", "Look", item.lookId, { itemId: id, order, note });
  revalidateContent();
}

export async function removeLookItemAction(formData: FormData) {
  const me = await requireSection("content");
  const id = String(formData.get("id") ?? "");
  const item = await db.lookItem.delete({ where: { id } });
  await audit(me.id, "look.removeItem", "Look", item.lookId, { productId: item.productId });
  revalidateContent();
}

export async function deleteLookAction(formData: FormData) {
  const me = await requireSection("content");
  const id = String(formData.get("id") ?? "");
  const look = await db.look.delete({ where: { id } });
  await audit(me.id, "look.delete", "Look", id, { title: look.title });
  revalidateContent();
  redirect("/crm/content?tab=looks");
}

// ───────────── Журнал ─────────────

const ArticleSchema = z.object({
  title: z.string().trim().min(1, "Заголовок"),
  slug: z.string().trim().optional(),
  excerpt: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  coverUrl: z.string().trim().optional(),
  body: z.string().min(1, "Текст статьи"),
  publishedAt: z.string().trim().optional(),
  metaTitle: z.string().trim().max(70).optional(),
  metaDescription: z.string().trim().max(200).optional(),
  keywords: z.string().trim().max(500).optional(),
});

export async function saveArticleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("content");
  const parsed = ArticleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const id = String(formData.get("id") ?? "");
  let publishedAt: Date | null = null;
  if (d.publishedAt) {
    publishedAt = new Date(d.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) return { error: "Неверная дата публикации" };
  }
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);
  const data = {
    title: d.title,
    slug: d.slug ? slugify(d.slug) : slugify(d.title),
    excerpt: d.excerpt || null,
    category: d.category || null,
    coverUrl: d.coverUrl || null,
    body: d.body.replace(/\r/g, ""),
    publishedAt,
    metaTitle: d.metaTitle || null,
    metaDescription: d.metaDescription || null,
    keywords: (d.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
  };
  if (!data.slug) return { error: "Не удалось составить адрес страницы — укажите его латиницей" };
  let articleId = id;
  try {
    if (id) {
      await db.article.update({ where: { id }, data: { ...data, products: { set: productIds.map((pid) => ({ id: pid })) } } });
    } else {
      articleId = (await db.article.create({ data: { ...data, authorId: me.id, products: { connect: productIds.map((pid) => ({ id: pid })) } } })).id;
    }
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg.includes("Unique") ? "Статья с таким адресом страницы уже есть" : msg };
  }
  await audit(me.id, id ? "article.update" : "article.create", "Article", articleId, { title: data.title, slug: data.slug, published: !!publishedAt });
  revalidateContent();
  if (!id) redirect(`/crm/content/articles/${articleId}`);
  return { ok: true, message: "Сохранено" };
}

export async function deleteArticleAction(formData: FormData) {
  const me = await requireSection("content");
  const id = String(formData.get("id") ?? "");
  const a = await db.article.delete({ where: { id } });
  await audit(me.id, "article.delete", "Article", id, { title: a.title });
  revalidateContent();
  redirect("/crm/content?tab=journal");
}
