import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { backupStatus } from "@/lib/backups";

export const dynamic = "force-dynamic";

/** Почта сайта: подключена ли, каким способом, последняя ошибка и сколько писем за сутки не ушло. */
async function mailStatus() {
  const since = new Date(Date.now() - 86_400_000);
  const [ch, failed, skipped, sent] = await Promise.all([
    db.channelIntegration.findUnique({ where: { channel: "EMAIL" }, select: { enabled: true, config: true, lastError: true, lastEventAt: true } }),
    db.notification.count({ where: { channel: "EMAIL", status: "FAILED", createdAt: { gte: since } } }),
    db.notification.count({ where: { channel: "EMAIL", status: "SKIPPED", createdAt: { gte: since } } }),
    db.notification.count({ where: { channel: "EMAIL", status: "SENT", createdAt: { gte: since } } }),
  ]);
  const cfg = (ch?.config as Record<string, string> | null) ?? {};
  return { enabled: !!ch?.enabled, transport: cfg.smtpHost ? "smtp" : cfg.postmarkToken ? "postmark" : null, lastError: ch?.lastError ?? null, lastInboundAt: ch?.lastEventAt ?? null, sent24h: sent, failed24h: failed, skipped24h: skipped };
}

/** Папка фото из CRM (том uploads на сервере): может ли приложение записать новые кадры. Без неё «Загрузить фото» не работает. */
async function uploadsStatus() {
  const root = path.join(process.cwd(), "public", "uploads");
  try {
    await access(root, constants.W_OK);
    await access(path.join(root, "products"), constants.W_OK).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
    return { writable: true, error: null };
  } catch (e) {
    return { writable: false, error: (e as NodeJS.ErrnoException).code ?? "unknown" };
  }
}

/**
 * Какие интеграции включены — только ключи, без настроек и секретов, — и у каких последняя проверка из CRM не прошла.
 * Нужно внешнему мониторингу: снаружи видно, подключены ли оплата, касса, доставка, копии в S3 и каналы сообщений.
 */
async function integrationsStatus() {
  const [rows, channels] = await Promise.all([
    db.integration.findMany({ where: { enabled: true }, select: { key: true, lastCheckOk: true }, orderBy: { key: "asc" } }),
    db.channelIntegration.findMany({ where: { enabled: true }, select: { channel: true }, orderBy: { channel: "asc" } }),
  ]);
  return { enabled: rows.map((r) => r.key), failing: rows.filter((r) => r.lastCheckOk === false).map((r) => r.key), channels: channels.map((c) => c.channel) };
}

/** Проверка живости: версия сборки (коммит) и доступность базы. Используется мониторингом и аудитом. */
export async function GET() {
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const uploads = await uploadsStatus();
  const backup = dbOk ? await backupStatus().catch(() => null) : null;
  const mail = dbOk ? await mailStatus().catch(() => null) : null;
  const integrations = dbOk ? await integrationsStatus().catch(() => null) : null;
  return NextResponse.json(
    { ok: dbOk, commit: process.env.GIT_SHA ?? "unknown", builtAt: process.env.BUILD_AT ?? null, time: new Date().toISOString(), uploads, backup, mail, integrations },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
