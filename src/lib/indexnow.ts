import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { activeIntegration, recordCheck } from "@/lib/integrations/store";
import { siteUrl } from "@/lib/seo";

/**
 * IndexNow: мгновенное уведомление Яндекса и Bing об изменённых страницах (протокол indexnow.org, один запрос
 * в api.indexnow.org доходит до всех участников). Ключ — любая строка 8–128 символов; сайт отдаёт её по адресу
 * /indexnow/<ключ>.txt, и поисковик по этому файлу убеждается, что уведомление прислал владелец сайта.
 */
export const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

export function newIndexNowKey() {
  return randomBytes(16).toString("hex");
}

/** Ключ включённой интеграции; пустой ключ создаётся и сохраняется при первом обращении. */
export async function getIndexNowKey(): Promise<string | null> {
  const i = await activeIntegration("indexnow");
  if (!i) return null;
  const key = (i.config.key ?? "").trim();
  if (KEY_RE.test(key)) return key;
  const generated = newIndexNowKey();
  await db.integration.update({ where: { key: "indexnow" }, data: { config: { ...i.config, key: generated } } });
  return generated;
}

/**
 * Один раз после включения — вся карта сайта: поисковики узнают обо всех страницах сразу, дальше уходят только
 * изменённые. Отметка о рассылке хранится в настройках; вызывается из задачи «warm» после каждого обновления.
 */
export async function submitSitemapOnce(): Promise<{ sent: number; skipped?: string }> {
  const key = await getIndexNowKey();
  if (!key) return { sent: 0, skipped: "интеграция выключена" };
  if (/localhost|127\.0\.0\.1/.test(siteUrl())) return { sent: 0, skipped: "стенд" };
  const done = await db.setting.findUnique({ where: { key: "indexnowBulkAt" } });
  if (done) return { sent: 0, skipped: `уже отправлялось ${String(done.value)}` };
  const { default: sitemap } = await import("@/app/sitemap");
  const urls = (await sitemap()).map((e) => e.url);
  await pingIndexNow(urls);
  const at = new Date().toISOString();
  await db.setting.upsert({ where: { key: "indexnowBulkAt" }, update: { value: at }, create: { key: "indexnowBulkAt", value: at } });
  return { sent: urls.length };
}

/**
 * Отправить адреса страниц (пути вида /journal/slug). Ошибка не мешает сохранению в CRM: она записывается в карточку
 * интеграции и видна там. Боевой адрес берётся из APP_URL — на стенде с localhost ничего не отправляется.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  try {
    const key = await getIndexNowKey();
    if (!key) return;
    const base = siteUrl();
    const host = new URL(base).host;
    if (/localhost|127\.0\.0\.1/.test(host)) return;
    const urlList = [...new Set(paths)].map((p) => (p.startsWith("http") ? p : `${base}${p}`)).slice(0, 10_000);
    if (!urlList.length) return;
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow/${key}.txt`, urlList }),
      signal: AbortSignal.timeout(8_000),
    });
    // 200 — принято, 202 — принято, ключ проверят позже; остальное — ошибка настройки
    if (res.status === 200 || res.status === 202) await recordCheck("indexnow", true, null);
    else await recordCheck("indexnow", false, `IndexNow ответил ${res.status}${res.status === 403 ? ": ключ не подтверждён (файл ключа недоступен)" : res.status === 422 ? ": адреса не с этого домена" : ""}`);
  } catch (e) {
    await recordCheck("indexnow", false, e instanceof Error ? e.message.slice(0, 200) : "ошибка").catch(() => {});
  }
}
