import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Фото, загруженные в CRM, отдаются отсюда. next start обслуживает только те файлы public/, что были на месте
 * при запуске сервера, поэтому без этого обработчика новое фото товара открывалось лишь после перезапуска сайта
 * (404 у самого файла и 400 у оптимизатора картинок). Файлы, которые сервер уже знает, он по-прежнему отдаёт сам.
 */
const ROOT = path.join(process.cwd(), "public", "uploads");
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  // только фото товаров и только «простые» имена: никаких «..», скрытых файлов и посторонних типов
  if (parts[0] !== "products" || parts.some((p) => !/^[\w-][\w.-]*$/.test(p) || p.includes(".."))) return notFound();
  const type = TYPES[path.extname(parts[parts.length - 1]).toLowerCase()];
  const file = path.join(ROOT, ...parts);
  if (!type || !file.startsWith(ROOT + path.sep)) return notFound();
  try {
    if (!(await stat(file)).isFile()) return notFound();
    const body = await readFile(file);
    // имя файла уникально (время + случайная часть), содержимое по этому адресу не меняется
    return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return notFound();
  }
}
