"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const MAX = 12 * 1024 * 1024;

/** Тип файла определяется по сигнатуре содержимого, а не по заявленному MIME. */
function sniffImage(buf: Buffer): keyof typeof TYPES | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/.test(buf.subarray(8, 12).toString("ascii"))) return "image/avif";
  return null;
}

/** Загрузка фото товара в public/uploads/products/<productId>/. В продакшене папка должна быть на постоянном диске или заменена на S3. */
export async function uploadProductImagesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("products");
  const productId = String(formData.get("productId"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Выберите файлы" };
  const product = await db.product.findUnique({ where: { id: productId }, include: { images: true } });
  if (!product) return { error: "Товар не найден" };
  const dir = path.join(process.cwd(), "public", "uploads", "products", productId);
  await mkdir(dir, { recursive: true });
  let order = product.images.length;
  const added: string[] = [];
  for (const f of files) {
    if (f.size > MAX) return { error: `${f.name}: больше 12 МБ` };
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = sniffImage(buf);
    const ext = mime ? TYPES[mime] : undefined;
    if (!ext) return { error: `${f.name}: это не изображение JPG, PNG, WEBP или AVIF` };
    const name = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}.${ext}`;
    await writeFile(path.join(dir, name), buf);
    const url = `/uploads/products/${productId}/${name}`;
    await db.productImage.create({ data: { productId, url, alt: product.name, order: order++ } });
    added.push(url);
  }
  await audit(me.id, "product.images", "Product", productId, { added });
  revalidatePath(`/crm/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Загружено: ${added.length}` };
}

export async function removeProductImageAction(formData: FormData) {
  const me = await requireSection("products");
  const id = String(formData.get("id"));
  const img = await db.productImage.delete({ where: { id } });
  if (img.url.startsWith("/uploads/products/")) {
    const file = path.join(process.cwd(), "public", path.normalize(img.url).replace(/^(\.\.[/\\])+/, ""));
    await unlink(file).catch(() => {});
  }
  await audit(me.id, "product.imageRemove", "Product", img.productId, { url: img.url });
  revalidatePath(`/crm/products/${img.productId}`);
  revalidatePath("/", "layout");
}

export async function moveProductImageAction(formData: FormData) {
  await requireSection("products");
  const id = String(formData.get("id"));
  const dir = String(formData.get("dir")) === "up" ? -1 : 1;
  const img = await db.productImage.findUniqueOrThrow({ where: { id } });
  const all = await db.productImage.findMany({ where: { productId: img.productId }, orderBy: { order: "asc" } });
  const i = all.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= all.length) return;
  await db.$transaction([
    db.productImage.update({ where: { id: all[i].id }, data: { order: j } }),
    db.productImage.update({ where: { id: all[j].id }, data: { order: i } }),
  ]);
  revalidatePath(`/crm/products/${img.productId}`);
}
