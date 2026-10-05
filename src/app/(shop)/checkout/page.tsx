import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { quoteAction } from "@/app/actions/shop";
import { getGuestToken, guestCartCount } from "@/lib/guest-cart";
import { getSettingOrDefault } from "@/lib/settings";
import { activeIntegration } from "@/lib/integrations/store";

export const metadata: Metadata = { title: "Оформление заказа" };

export default async function CheckoutPage() {
  const user = await getCurrentCustomer();
  const count = user ? await db.cartItem.count({ where: { userId: user.id } }) : await guestCartCount(await getGuestToken());
  if (count === 0) redirect("/cart");
  const [addresses, seller, dadata, initialQuote] = await Promise.all([
    user ? db.address.findMany({ where: { userId: user.id, NOT: { label: "Архив" } }, orderBy: { isDefault: "desc" } }) : [],
    getSettingOrDefault("seller"),
    activeIntegration("dadata"),
    quoteAction({ deliveryMethod: "COURIER" }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <PageTitle title="Оформление заказа" />
      <CheckoutForm
        initialQuote={initialQuote}
        guest={!user}
        showroom={seller.showroom || null}
        suggestions={!!dadata?.config.token}
        profile={user ? {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          pointsBalance: user.pointsBalance,
          tierName: user.loyaltyTier?.name ?? null,
          maxPayPct: user.loyaltyTier?.maxPayPct ?? 30,
        } : null}
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
