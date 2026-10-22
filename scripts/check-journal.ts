// Проверка пачек статей журнала (prisma/journal) до выкладки: npm run check:journal
// Ловит то, что видно только на боевом сайте: повтор адреса, ссылку на статью, которая ещё не вышла (до её выхода
// это 404), ссылку на несуществующую страницу, слишком длинные SEO-поля, сломанную разметку.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { JOURNAL_BATCHES } from "../prisma/journal";

const root = path.resolve(__dirname, "..");
const legacy = [...readFileSync(path.join(root, "prisma/seed-journal.ts"), "utf8").matchAll(/^\s{6}slug: "([^"]+)"/gm)].map((m) => m[1]);
const pages = new Set(["/", ...readdirSync(path.join(root, "src/app/(shop)"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/${d.name}`)]);

const batch = JOURNAL_BATCHES.flat();
const at = new Map(batch.map((a) => [a.slug, new Date(a.publishedAt).getTime()]));
const errors: string[] = [];
const seen = new Set<string>();

for (const a of batch) {
  const where = `${a.publishedAt} ${a.slug}`;
  if (seen.has(a.slug) || legacy.includes(a.slug)) errors.push(`${where}: адрес уже занят`);
  seen.add(a.slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)) errors.push(`${where}: адрес не латиницей через дефис`);
  if (Number.isNaN(new Date(a.publishedAt).getTime()) || !/[+-]\d\d:\d\d$|Z$/.test(a.publishedAt)) errors.push(`${where}: дата без часового пояса`);
  if (a.metaTitle.length > 70) errors.push(`${where}: metaTitle ${a.metaTitle.length} > 70 символов`);
  if (a.metaDescription.length > 170) errors.push(`${where}: metaDescription ${a.metaDescription.length} > 170 символов`);
  if (a.excerpt.length > 320) errors.push(`${where}: аннотация ${a.excerpt.length} > 320 символов`);
  if (a.body.length < 2200) errors.push(`${where}: текст короче 2200 символов (${a.body.length})`);
  if (/\|.*\|/.test(a.body)) errors.push(`${where}: таблицы Markdown сайт не показывает`);
  if (/выходит \d/.test(a.body)) errors.push(`${where}: анонс «выходит …» — ссылаться можно только на вышедшие статьи`);
  for (const [, href] of a.body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const [p] = href.split(/[?#]/);
    const j = p.match(/^\/journal\/([^/]+)$/);
    if (j) {
      const target = j[1];
      if (legacy.includes(target)) continue;
      const t = at.get(target);
      if (t === undefined) errors.push(`${where}: ссылка на несуществующую статью ${href}`);
      else if (t >= new Date(a.publishedAt).getTime()) errors.push(`${where}: ссылка на статью, которая выйдет позже, ${href}`);
    } else if (p.startsWith("/") && !p.startsWith("/product/") && !pages.has(p)) errors.push(`${where}: нет страницы ${href}`);
  }
}
const days = new Map<string, number>();
for (const a of batch) days.set(a.publishedAt.slice(0, 10), (days.get(a.publishedAt.slice(0, 10)) ?? 0) + 1);
console.log(`статей в пачках: ${batch.length}, дней: ${days.size}, с ${[...days.keys()].sort()[0]} по ${[...days.keys()].sort().at(-1)}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("ок");
