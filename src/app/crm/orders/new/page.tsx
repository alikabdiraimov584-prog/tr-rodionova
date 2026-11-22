import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireSection } from "@/lib/auth";
import { PageTitle } from "@/components/ui";
import { ManualOrderForm } from "@/components/crm/manual-order-form";

export const metadata: Metadata = { title: "Продажа в шоуруме" };

export default async function NewOrderPage({ searchParams }: PageProps<"/crm/orders/new">) {
  await requireSection("ordersEdit");
  const sp = await searchParams;
  const [customers, variants] = await Promise.all([
    db.user.findMany({ where: { role: "CUSTOMER" }, orderBy: { firstName: "asc" } }),
    db.productVariant.findMany({ where: { product: { status: "ACTIVE" } }, include: { product: true }, orderBy: [{ product: { name: "asc" } }, { sku: "asc" }] }),
  ]);
  return (
    <div>
      <PageTitle eyebrow="Офлайн-продажа" title="Новый заказ">Заказ резервирует товар. С отметкой «Оплачено» он сразу списывается со склада, попадает в финансы и уровень клиента.</PageTitle>
      <ManualOrderForm
        presetCustomer={typeof sp.customer === "string" ? sp.customer : undefined}
        customers={customers.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""} · ${c.phone ?? c.email}` }))}
        variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} · ${v.color ?? ""} · ${v.size}`, price: v.price ?? v.product.price, available: v.stock - v.reserved }))}
      />
    </div>
  );
}
