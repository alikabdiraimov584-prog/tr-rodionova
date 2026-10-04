import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { quoteAction } from "@/app/actions/shop";

export const metadata: Metadata = { title: "Оформление заказа" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const count = await db.cartItem.count({ where: { userId: user.id } });
  if (count === 0) redirect("/cart");
  const addresses = await db.address.findMany({ where: { userId: user.id, NOT: { label: "Архив" } }, orderBy: { isDefault: "desc" } });
  const initialQuote = await quoteAction({ deliveryMethod: "COURIER" });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <PageTitle eyebrow="Шаг 2 из 2" title="Оформление заказа" />
      <CheckoutForm
        initialQuote={initialQuote}
        profile={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          pointsBalance: user.pointsBalance,
          tierName: user.loyaltyTier?.name ?? null,
          maxPayPct: user.loyaltyTier?.maxPayPct ?? 30,
        }}
        addresses={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          isDefault: a.isDefault,
          text: [a.city, a.street, a.building, a.apartment && `кв. ${a.apartment}`].filter(Boolean).join(", "),
        }))}
      />
    </div>
  );
}
