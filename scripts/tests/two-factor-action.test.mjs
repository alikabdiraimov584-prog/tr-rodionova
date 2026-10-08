// Проверка: серверное действие CRM нельзя выполнить сессией без второго фактора, даже если POST отправлен не на /crm.
// Запуск: BASE_URL — стенд с STAFF_2FA_REQUIRED=0 (чтобы снять настоящий запрос действия), STRICT_URL — тот же билд с STAFF_2FA_REQUIRED=1.
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const strict = process.env.STRICT_URL ?? "http://127.0.0.1:3101";
const fails = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!ok) fails.push(name); };
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${base}/login`); await p.fill('form:has(input[name="password"]) input[name="email"]', "admin@tr-rodionova.ru"); await p.fill('input[name="password"]', "admin12345"); await p.click('form:has(input[name="password"]) button.btn-primary'); await p.waitForURL(/crm/);
await p.goto(`${base}/crm/tasks`);
const title = `2fa-action-test ${Date.now()}`;
let captured = null;
p.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) captured = { headers: r.headers(), body: r.postDataBuffer() }; });
await p.fill('input[name="title"]', title);
await p.click("text=Создать задачу");
await p.waitForTimeout(2500);
check("действие снято с настоящей формы", !!captured && (await p.textContent("body")).includes(title));
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await b.close();
if (!captured) { console.log("FAILED: нет запроса"); process.exit(1); }
// тот же запрос в строгий инстанс, на корень сайта (мимо проверки адреса /crm в proxy), с заголовком новой задачи
const headers = { ...captured.headers, cookie, origin: strict, referer: `${strict}/` };
for (const k of ["host", "content-length", "accept-encoding"]) delete headers[k];
const body = Buffer.from(captured.body.toString("latin1").replace(title, `${title} STRICT`), "latin1");
headers["content-length"] = String(body.length);
// три адреса: страница задач (proxy отправляет на /crm/security), страница защиты и корень сайта (Next пересылает
// действие странице-владельцу /crm/tasks, где proxy его тоже режет). Решающая проверка — задача не появилась в базе.
const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
for (const path of ["/crm/tasks", "/crm/security", "/"]) {
  const res = await fetch(`${strict}${path}`, { method: "POST", headers: { ...headers, referer: `${strict}${path}` }, body, redirect: "manual" });
  const redirectTo = res.headers.get("x-action-redirect") ?? res.headers.get("location") ?? "";
  const r = await pool.query('SELECT count(*)::int AS n FROM "CrmTask" WHERE title = $1', [`${title} STRICT`]);
  check(`строгий режим: POST ${path} не создаёт задачу`, r.rows[0].n === 0, `HTTP ${res.status}${redirectTo ? " → " + redirectTo.slice(0, 50) : ""}`);
}
await pool.query('DELETE FROM "CrmTask" WHERE title LIKE $1', [`2fa-action-test %`]);
await pool.end();
console.log(fails.length ? `FAILED: ${fails.join(", ")}` : "two-factor-action: все проверки PASS");
process.exit(fails.length ? 1 : 0);
