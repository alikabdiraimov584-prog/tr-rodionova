"use server";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/action-result";

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
const MAX = 12 * 1024 * 1024;
/** Длинная сторона после загрузки: для карточки на любом экране хватает, а витрина отдаёт уменьшенные копии сама. */
const MAX_SIDE = 3000;

/**
 * Приводит фото к виду для витрины: поворот по EXIF, не больше MAX_SIDE по длинной стороне, без метаданных
 * (включая геометки и серийный номер камеры). JPEG, WebP, AVIF и PNG без прозрачности → JPEG 90, 4:4:4;
 * PNG с прозрачностью остаётся PNG.
 */
async function normalizeImage(buf: Buffer, mime: ImageMime) {
  const img = sharp(buf, { failOn: "none", limitInputPixels: 120e6 }).rotate();
  const meta = await img.metadata();
  const keepPng = mime === "image/png" && !!meta.hasAlpha;
  const resized = img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  const { data, info } = keepPng
    ? await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await resized.jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, ext: keepPng ? "png" : "jpg", width: info.width, height: info.height };
}

/** Тип файла определяется по сигнатуре содержимого, а не по заявленному MIME. */
function sniffImage(buf: Buffer): ImageMime | null {
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
  const sizes: string[] = [];
  for (const f of files) {
    if (f.size > MAX) return { error: `${f.name}: больше 12 МБ` };
    const buf = Buffer.from(await f.arrayBuffer());
    const mime = sniffImage(buf);
    if (!mime) return { error: `${f.name}: это не изображение JPG, PNG, WEBP или AVIF` };
    let out: Awaited<ReturnType<typeof normalizeImage>>;
    try {
      out = await normalizeImage(buf, mime);
    } catch {
      return { error: `${f.name}: файл не удалось прочитать как изображение` };
    }
    const name = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}.${out.ext}`;
    await writeFile(path.join(dir, name), out.data);
    const url = `/uploads/products/${productId}/${name}`;
    await db.productImage.create({ data: { productId, url, alt: product.name, order: order++ } });
    added.push(url);
    sizes.push(`${out.width}×${out.height}`);
  }
  await audit(me.id, "product.images", "Product", productId, { added });
  revalidatePath(`/crm/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Загружено: ${added.length} (${sizes.join(", ")}), без данных камеры` };
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
