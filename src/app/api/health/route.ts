import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Проверка живости: версия сборки (коммит) и доступность базы. Используется мониторингом и аудитом. */
export async function GET() {
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    { ok: dbOk, commit: process.env.GIT_SHA ?? "unknown", builtAt: process.env.BUILD_AT ?? null, time: new Date().toISOString() },
    { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
