import "server-only";
import { db } from "@/lib/db";

/**
 * Прогрев кэша оптимизатора картинок: первая сборка AVIF из кадра 1600×2000 занимает около секунды,
 * и без прогрева её ждёт первая покупательница после каждого обновления сайта. Запрашиваем все кадры
 * активных вещей в ширинах каталога и карточки, чтобы варианты уже лежали в кэше (.next/cache/images).
 */
const WIDTHS = [384, 640, 828, 1080, 1920];

export async function warmImages(base = `http://127.0.0.1:${process.env.PORT ?? 3000}`) {
  const images = await db.productImage.findMany({
    where: { product: { status: "ACTIVE" }, url: { not: { startsWith: "/images/placeholder/" } } },
    select: { url: true },
    distinct: ["url"],
  });
  const looks = await db.look.findMany({ where: { coverUrl: { not: null } }, select: { coverUrl: true } });
  const urls = [...new Set([...images.map((i) => i.url), ...looks.map((l) => l.coverUrl!).filter((u) => u.startsWith("/"))])];
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  const queue = urls.flatMap((url) => WIDTHS.map((w) => `${base}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`));
  // по две одновременно: не мешаем обычным запросам
  const workers = Array.from({ length: 2 }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const r = await fetch(item, { headers: { Accept: "image/avif,image/webp,image/*" } });
        await r.arrayBuffer();
        if (r.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
  });
  await Promise.all(workers);
  return { images: urls.length, variants: ok, failed, ms: Date.now() - started };
}
