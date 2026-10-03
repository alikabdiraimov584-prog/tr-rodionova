import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  payload?: Prisma.InputJsonValue,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  await client.auditLog.create({
    data: { userId, action, entity, entityId: entityId ?? null, payload: payload ?? undefined },
  });
}
