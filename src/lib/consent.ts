import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import type { ConsentType } from "@/generated/prisma/enums";

/** Редакция юридических документов (docs/legal/*.md). Меняйте при обновлении текста. */
export const LEGAL_VERSION = "2026-10-02";

export async function recordConsent(tx: Prisma.TransactionClient, userId: string, type: ConsentType, granted: boolean) {
  const h = await headers();
  // последний адрес в X-Forwarded-For добавлен доверенным прокси; первый мог подставить клиент
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = xff[xff.length - 1] ?? h.get("x-real-ip") ?? null;
  await tx.consent.create({
    data: { userId, type, granted, version: LEGAL_VERSION, ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null },
  });
}
