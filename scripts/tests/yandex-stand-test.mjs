// Яндекс Доставка на стенде глазами менеджера и покупательницы: подставной сервер API Яндекса и геокодера на 2727,
// стенд запущен с YANDEX_DELIVERY_API_URL=http://127.0.0.1:2727 и YANDEX_GEOCODER_URL=http://127.0.0.1:2727/geocode.
// Сценарий: вызвать курьера → цена → подтвердить → курьер найден → забор (уведомление) → заказ «В доставке»,
// покупательница видит ссылку слежения → вручение → «Доставлен».
// Запуск: E2E_BASE_URL=http://127.0.0.1:3100 DATABASE_URL=… AUTH_SECRET=… node scripts/tests/yandex-stand-test.mjs
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const run = promisify(execFile);
let fails = 0;
const check = (name, ok, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fails++;
};

// ───────────── подставной Яндекс ─────────────
const claims = new Map();
let seq = 0;
const api = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
  const json = (status, data) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/geocode") {
    const q = url.searchParams.get("geocode") ?? "";
    return json(200, { response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "37.606 55.765" }, metaDataProperty: { GeocoderMetaData: { precision: "exact", text: q } } } }] } } });
  }
  if (req.headers.authorization !== "Bearer test-token") return json(401, { code: "unauthorized", message: "неверный токен" });
  const id = url.searchParams.get("claim_id") ?? "";
  const c = claims.get(id);
  switch (url.pathname) {
    case "/claims/search":
      return json(200, { claims: [] });
    case "/claims/create": {
      const claimId = `stand-${Date.now().toString(36)}-${++seq}`;
      claims.set(claimId, { status: "estimating", version: 1, performer: null, body });
      return json(200, { id: claimId, status: "new", version: 1 });
    }
    case "/claims/info":
      if (!c) return json(404, { message: "нет заявки" });
      if (c.status === "estimating") c.status = "ready_for_approval";
      return json(200, { id, status: c.status, version: c.version, pricing: { offer: { price: "349.00" }, ...(c.status === "delivered_finish" ? { final_price: "349.00" } : {}), currency_rules: { code: "RUB" } }, performer_info: c.performer ?? undefined, error_messages: [], route_points: [{ id: 1, type: "source" }, { id: 2, type: "destination" }] });
    case "/claims/accept":
      if (!c) return json(404, { message: "нет заявки" });
      c.status = "accepted";
      c.version++;
      return json(200, { id, status: c.status, version: c.version });
    case "/claims/cancel-info":
      return json(200, c?.performer ? { cancel_state: "paid", price: "150.00" } : { cancel_state: "free", price: "0" });
    case "/claims/cancel":
      c.status = body.cancel_state === "paid" ? "cancelled_with_payment" : "cancelled";
      return json(200, { id, status: c.status });
    case "/claims/tracking-links":
      return json(200, { route_points: [{ id: 2, type: "destination", sharing_link: `https://taxi.yandex.ru/route/${id}` }] });
    case "/driver-voiceforwarding":
      return json(200, { phone: "+78005553535", ext: "321", ttl_seconds: 3600 });
    case "/claims/points-eta":
      return json(200, { route_points: [{ id: 2, type: "destination", visited_at: { expected: new Date(Date.now() + 3_600_000).toISOString() } }] });
    default:
      return json(404, { message: `unexpected ${url.pathname}` });
  }
});
await new Promise((r) => api.listen(2727, "127.0.0.1", r));
const drive = (status, courier = false) => {
  for (const c of claims.values()) {
    c.status = status;
    if (courier) c.performer = { courier_name: "Иван К.", car_model: "Kia Rio", car_number: "А123ВС77", car_color: "белый" };
  }
};

// ───────────── заказ ─────────────
const { stdout } = await run("node", ["--conditions=react-server", "--import", "tsx", "scripts/tests/yandex-stand-order.ts"], { env: process.env, maxBuffer: 1 << 20 });
const order = JSON.parse(stdout.trim().split("\n").at(-1));
console.log("заказ", order);

// CRM стримит заготовку раздела (loading.tsx): после перехода ждём, пока она сменится содержимым, иначе innerText пустой
const settled = (p) => p.waitForFunction(() => !document.body.innerText.includes("Загружаем раздел"), null, { timeout: 20_000 }).catch(() => null);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function login(email, password, next) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 160)}`));
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
  await page.fill('form:has(input[name="password"]) input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('form:has(input[name="password"]) button.btn-primary');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}
const crm = await login("admin@tr-rodionova.ru", "admin12345", `/crm/orders/${order.id}`);
// карточка заявки — по заголовку блока, иначе под фильтр попадает лента событий с текстом «Яндекс Доставка: …»
const shipmentCard = (p) => p.locator("div.card", { has: p.locator(".eyebrow", { hasText: /^Яндекс Доставка/ }) }).first();
const card = shipmentCard(crm);
check("в карточке заказа есть блок Яндекс Доставки с кнопкой «Вызвать курьера»", (await card.locator('button:has-text("Вызвать курьера")').count()) === 1);
await card.locator('button:has-text("Вызвать курьера")').click();
await crm.waitForSelector("text=Ждёт подтверждения", { timeout: 60_000 });
const afterCreate = await card.innerText();
check("после вызова видна цена 349 ₽ и кнопка подтверждения", /349/.test(afterCreate) && (await card.locator('button:has-text("Подтвердить")').count()) === 1, afterCreate.replace(/\s+/g, " ").slice(0, 200));
check("событие «подтвердите заявку» в ленте заказа", (await crm.locator("text=подтвердите заявку").count()) >= 1);
await card.locator('button:has-text("Подтвердить")').click();
await crm.waitForSelector("text=ищем курьера", { timeout: 30_000 });
check("заявка подтверждена: статус «ищем курьера»", /ищем курьера/i.test(await card.innerText()));

drive("performer_found", true);
await card.locator('button:has-text("Обновить статус")').click();
await crm.waitForSelector("text=Иван К.", { timeout: 30_000 });
const found = await card.innerText();
check("курьер найден: имя, машина, телефон, ссылка слежения", /Иван К\./.test(found) && /Kia Rio/.test(found) && /\+78005553535/.test(found) && (await card.locator('a:has-text("Следить за курьером")').count()) === 1, found.replace(/\s+/g, " ").slice(0, 240));
check("заказ пока «Оплачен»", (await crm.locator("h1 ~ * .badge, header .badge").first().innerText().catch(() => "")).length >= 0);

// уведомление Яндекса о заборе посылки — как пришло бы с callback_url
drive("pickuped", true);
const cb = await fetch(`${base}/api/delivery/yandex`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim_id: [...claims.keys()][0], status: "pickuped", updated_ts: new Date().toISOString() }) });
check("уведомление принято (200)", cb.status === 200, String(cb.status));
await crm.reload(); await settled(crm);
const pageText = await crm.locator("body").innerText();
const badge = await crm.locator("h1").locator("xpath=..").locator("xpath=..").innerText().catch(() => "");
check("после забора заказ «В доставке», статус заявки «Курьер забрал посылку»", /В доставке/.test(pageText) && /Курьер забрал посылку/.test(pageText), `${badge.replace(/\s+/g, " ").slice(0, 120)} | ${(await shipmentCard(crm).innerText()).replace(/\s+/g, " ").slice(0, 120)}`);

const shop = await login("anna@example.com", "anna12345", `/account/orders/${order.id}`);
const accountText = await shop.locator("body").innerText();
const link = shop.locator('a:has-text("Следить за курьером")');
check("покупательница видит заказ «В доставке» и ссылку «Следить за курьером на карте»", /В доставке/.test(accountText) && (await link.count()) === 1 && /taxi\.yandex\.ru\/route/.test((await link.getAttribute("href")) ?? ""), accountText.replace(/\s+/g, " ").slice(0, 160));

drive("delivered_finish", true);
await shipmentCard(crm).locator('button:has-text("Обновить статус")').click();
await crm.waitForSelector("text=Вручено, заявка закрыта", { timeout: 30_000 });
await crm.reload(); await settled(crm);
const delivered = await crm.locator("body").innerText();
const ledger = await crm.locator("div.card", { has: crm.locator(".eyebrow", { hasText: "Финансовые проводки" }) }).first().innerText().catch(() => "");
check("вручено: заказ «Доставлен», кнопок заявки больше нет, расход «Доставка» 349 ₽ в проводках", /Доставлен/.test(delivered) && (await crm.locator('button:has-text("Обновить статус")').count()) === 0 && /Доставка[\s\S]*?349/.test(ledger), ledger.replace(/\s+/g, " ").slice(0, 160));
check("ошибок в консоли браузера нет", errors.length === 0, errors.join(" | "));

await browser.close();
api.close();
console.log(fails ? `\n${fails} проверок не прошли` : "\nВсе проверки прошли");
process.exit(fails ? 1 : 0);
