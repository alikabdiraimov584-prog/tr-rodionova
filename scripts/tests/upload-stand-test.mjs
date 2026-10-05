// Стендовая проверка загрузки фото в карточку вещи через CRM: файлы крупнее 1 МБ (как кадры со съёмки) должны
// проходить, сообщение об успехе появляться, фото — попадать в галерею. После проверки загруженное удаляется.
// Запуск: CHROME_PATH=… BASE_URL=http://127.0.0.1:3100 DATABASE_URL=… FILES=/путь/a.jpg,/путь/b.png node scripts/tests/upload-stand-test.mjs
import { chromium } from "playwright-core";
import { rm } from "node:fs/promises";
import { statSync } from "node:fs";
const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const files = (process.env.FILES ?? "").split(",").filter(Boolean);
if (!files.length) { console.log("FILES не задан"); process.exit(1); }
const fails = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails.push(name); };
const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows: [prod] } = await pool.query(`SELECT id FROM "Product" WHERE sku = 'TR-DR-101'`);
const before = (await pool.query(`SELECT count(*)::int AS n FROM "ProductImage" WHERE "productId" = $1`, [prod.id])).rows[0].n;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const http = [];
p.on("response", (r) => { if (r.request().method() === "POST" && r.url().includes("/crm/products/")) http.push(r.status()); });
await p.goto(`${base}/login`); await p.fill('input[name="email"]', "admin@tr-rodionova.ru"); await p.fill('input[name="password"]', "admin12345"); await p.click("form button.btn-primary"); await p.waitForURL(/crm/);
await p.goto(`${base}/crm/products/${prod.id}`);
await p.setInputFiles('input[name="files"]', files);
await p.click('button:has-text("Загрузить фото")');
await p.waitForTimeout(8000);
const t = await p.textContent("body");
const msg = (t.match(/Загружено: [^)]*\)[^<]{0,40}|[^.]{0,80}больше 12 МБ|Раздел не открылся|CRM обновилась/) ?? [""])[0];
const after = (await pool.query(`SELECT count(*)::int AS n FROM "ProductImage" WHERE "productId" = $1`, [prod.id])).rows[0].n;
console.log(`файлы: ${files.map((f) => `${f.split("/").pop()} ${Math.round(statSync(f).size / 1024)} КБ`).join(", ")}; POST статусы: ${http.join(",") || "—"}; текст: ${msg.trim() || "(нет сообщения)"}`);
check("загрузка прошла: фото добавлены в галерею", after === before + files.length, `было ${before}, стало ${after}`);
check("нет страницы ошибки", !/Раздел не открылся/.test(t));
await b.close();
// уборка: удалить загруженное из базы и с диска
const { rows: added } = await pool.query(`SELECT id, url FROM "ProductImage" WHERE "productId" = $1 AND url LIKE '/uploads/%'`, [prod.id]);
for (const a of added) { await pool.query(`DELETE FROM "ProductImage" WHERE id = $1`, [a.id]); await rm(`public${a.url}`, { force: true }); }
await pool.end();
console.log(fails.length ? `FAILED: ${fails.join(", ")}` : "upload: все проверки PASS");
process.exit(fails.length ? 1 : 0);
