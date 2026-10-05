import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { backupStatus } from "@/lib/backups";

export const dynamic = "force-dynamic";

/** Проверка живости: версия сборки (коммит) и доступность базы. Используется мониторингом и аудитом. */
export async function GET() {
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const backup = dbOk ? await backupStatus().catch(() => null) : null;
  return NextResponse.json(
    { ok: dbOk, commit: process.env.GIT_SHA ?? "unknown", builtAt: process.env.BUILD_AT ?? null, time: new Date().toISOString(), backup },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
