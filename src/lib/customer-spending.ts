import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Обновить сумму покупок за 12 месяцев и за всё время. */
export async function updateCustomerSpending(tx: Tx, userId: string) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const countable = ["PAID", "CONFIRMED", "PACKING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;
  const orders = await tx.order.findMany({
    where: { userId, status: { in: [...countable] } },
    select: { total: true, deliveryCost: true, createdAt: true, items: { select: { price: true, returnedQty: true } } },
  });
  let lifetime = 0;
  let year = 0;
  for (const o of orders) {
    const returned = o.items.reduce((s, i) => s + i.price * i.returnedQty, 0);
    const paid = Math.max(0, o.total - o.deliveryCost - returned);
    lifetime += paid;
    if (o.createdAt >= since) year += paid;
  }
  await tx.user.update({
    where: { id: userId },
    data: { lifetimeSpent: lifetime, yearSpent: year },
  });
}
