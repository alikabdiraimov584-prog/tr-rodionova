import "server-only";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function reserveStock(tx: Tx, variantId: string, qty: number, orderId: string) {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  if (v.stock - v.reserved < qty) {
    throw new Error(`«${v.product.name}», размер ${v.size}: доступно только ${Math.max(0, v.stock - v.reserved)} шт.`);
  }
  await tx.productVariant.update({ where: { id: variantId }, data: { reserved: { increment: qty } } });
  await tx.stockMovement.create({ data: { variantId, type: "RESERVE", quantity: -qty, orderId } });
}

export async function releaseStock(tx: Tx, variantId: string, qty: number, orderId: string, createdBy?: string | null) {
  await tx.productVariant.update({ where: { id: variantId }, data: { reserved: { decrement: qty } } });
  await tx.stockMovement.create({ data: { variantId, type: "RELEASE", quantity: qty, orderId, createdBy } });
}

/** Списать резерв в продажу после оплаты. */
export async function commitSale(tx: Tx, orderId: string, createdBy?: string | null) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: true } });
  for (const it of items) {
    await tx.productVariant.update({
      where: { id: it.variantId },
      data: { stock: { decrement: it.quantity }, reserved: { decrement: it.quantity } },
    });
    await tx.stockMovement.create({
      data: { variantId: it.variantId, type: "SALE", quantity: -it.quantity, orderId, unitCost: it.costPrice, createdBy },
    });
  }
}

export async function receiptStock(
  tx: Tx,
  variantId: string,
  qty: number,
  opts: { unitCost?: number | null; reason?: string; createdBy?: string | null },
) {
  if (qty <= 0) throw new Error("Количество должно быть больше нуля");
  await tx.productVariant.update({ where: { id: variantId }, data: { stock: { increment: qty } } });
  await tx.stockMovement.create({
    data: { variantId, type: "RECEIPT", quantity: qty, unitCost: opts.unitCost ?? null, reason: opts.reason, createdBy: opts.createdBy },
  });
}

export async function writeOffStock(
  tx: Tx,
  variantId: string,
  qty: number,
  opts: { reason: string; createdBy?: string | null },
) {
  if (qty <= 0) throw new Error("Количество должно быть больше нуля");
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  if (v.stock - v.reserved < qty) throw new Error("Нельзя списать больше, чем свободно на складе");
  await tx.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: qty } } });
  await tx.stockMovement.create({
    data: { variantId, type: "WRITE_OFF", quantity: -qty, reason: opts.reason, createdBy: opts.createdBy },
  });
}

export async function adjustStock(
  tx: Tx,
  variantId: string,
  actual: number,
  opts: { reason?: string; createdBy?: string | null },
) {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  const diff = actual - v.stock;
  if (diff === 0) return 0;
  if (actual < v.reserved) throw new Error("Фактический остаток меньше резерва по заказам");
  await tx.productVariant.update({ where: { id: variantId }, data: { stock: actual } });
  await tx.stockMovement.create({
    data: { variantId, type: "ADJUSTMENT", quantity: diff, reason: opts.reason ?? "Инвентаризация", createdBy: opts.createdBy },
  });
  return diff;
}

/** Возврат товара по заказу: возвращает на склад и увеличивает returnedQty. */
export async function returnOrderItems(
  tx: Tx,
  orderId: string,
  lines: { orderItemId: string; qty: number }[],
  opts: { reason?: string; createdBy?: string | null; restock?: boolean },
) {
  let returnedValue = 0;
  for (const line of lines) {
    if (line.qty <= 0) continue;
    const item = await tx.orderItem.findUniqueOrThrow({ where: { id: line.orderItemId } });
    if (item.orderId !== orderId) throw new Error("Позиция не относится к заказу");
    if (item.returnedQty + line.qty > item.quantity) throw new Error("Количество возврата превышает купленное");
    await tx.orderItem.update({ where: { id: item.id }, data: { returnedQty: { increment: line.qty } } });
    if (opts.restock !== false) {
      await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: line.qty } } });
    }
    await tx.stockMovement.create({
      data: {
        variantId: item.variantId,
        type: opts.restock === false ? "WRITE_OFF" : "RETURN",
        quantity: opts.restock === false ? 0 : line.qty,
        orderId,
        reason: opts.reason ?? "Возврат от клиента",
        createdBy: opts.createdBy,
      },
    });
    returnedValue += item.price * line.qty;
  }
  return returnedValue;
}
