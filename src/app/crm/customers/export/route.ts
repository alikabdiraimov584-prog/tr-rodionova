import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { customerStats } from "@/lib/analytics";
import { rfmSegment } from "@/lib/rfm";
import { audit } from "@/lib/audit";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "customersEdit")) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const tier = url.searchParams.get("tier");
  const segment = url.searchParams.get("segment");
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q");
  const [users, stats] = await Promise.all([
    db.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(tier ? { loyaltyTier: { code: tier } } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
      },
      include: { loyaltyTier: true },
      orderBy: { lifetimeSpent: "desc" },
    }),
    customerStats(),
  ]);
  const header = ["Имя", "Фамилия", "Email", "Телефон", "Дата рождения", "Уровень", "Сегмент", "Заказов", "LTV, ₽", "За 12 мес., ₽", "Баллы", "Последний заказ", "Источник", "Размер", "Согласие на рассылки", "Теги"];
  const lines = [header.join(";")];
  for (const u of users) {
    const s = stats.get(u.id);
    const seg = rfmSegment({ lastOrderAt: s?.lastOrderAt ?? null, ordersCount: s?.ordersCount ?? 0, lifetimeSpent: u.lifetimeSpent, createdAt: u.createdAt });
    if (segment && seg.code !== segment) continue;
    lines.push(
      [u.firstName, u.lastName, u.email, u.phone, u.birthday?.toISOString().slice(0, 10), u.loyaltyTier?.name, seg.label, s?.ordersCount ?? 0, Math.round(u.lifetimeSpent / 100), Math.round(u.yearSpent / 100), u.pointsBalance, s?.lastOrderAt?.toISOString().slice(0, 10), u.source, u.preferredSize, u.marketingConsent ? "да" : "нет", u.tags.join(", ")]
        .map(csv)
        .join(";"),
    );
  }
  await audit(user.id, "customers.export", "User", null, { count: lines.length - 1 });
  return new Response("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
