import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const codeHash = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");

export function hashLoginCode(email: string, code: string) {
  return codeHash(email, code);
}

/**
 * Validate and consume the newest active email login code as one serialized operation.
 * The transaction-level advisory lock prevents concurrent guesses from bypassing the
 * attempt limit and prevents two requests from consuming the same one-time code.
 */
export async function consumeLoginCode(email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return { status: "invalid" as const };

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`login-code:${email}`}))::text AS lock_acquired`;
    const now = new Date();
    const rec = await tx.loginCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!rec || rec.attempts >= 5) return { status: "expired" as const };

    const suppliedHash = Buffer.from(codeHash(email, code), "hex");
    const storedHash = Buffer.from(rec.codeHash, "hex");
    const matches = suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
    if (!matches) {
      await tx.loginCode.updateMany({
        where: { id: rec.id, usedAt: null, attempts: { lt: 5 }, expiresAt: { gt: now } },
        data: { attempts: { increment: 1 } },
      });
      return { status: "invalid" as const };
    }

    const user = await tx.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      await tx.loginCode.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now } });
      return { status: "account" as const };
    }
    if (user.role !== "CUSTOMER") {
      await tx.loginCode.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now } });
      return { status: "staff" as const };
    }

    const claimed = await tx.loginCode.updateMany({
      where: { id: rec.id, usedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { status: "expired" as const };
    return { status: "ok" as const, user };
  });
}
