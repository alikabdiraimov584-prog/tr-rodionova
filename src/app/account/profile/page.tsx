import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageTitle, Badge } from "@/components/ui";
import { AddressForm, PasswordForm, ProfileForm } from "@/components/account/profile-forms";
import { deleteAddressAction, setDefaultAddressAction } from "@/app/actions/account";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const user = await requireUser("/account/profile");
  const addresses = await db.address.findMany({ where: { userId: user.id, NOT: { label: "Архив" } }, orderBy: { isDefault: "desc" } });
  return (
    <div className="space-y-12">
      <PageTitle title="Профиль и мерки" />
      <section>
        <h2 className="mb-4 text-xl">Личные данные</h2>
        <ProfileForm
          user={{
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            email: user.email,
            birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : null,
            preferredSize: user.preferredSize,
            marketingConsent: user.marketingConsent,
            height: user.height,
            bust: user.bust,
            waist: user.waist,
            hips: user.hips,
          }}
        />
      </section>
      <section>
        <h2 className="mb-4 text-xl">Адреса доставки</h2>
        {addresses.length > 0 && (
          <div className="mb-6 divide-y divide-line border-y border-line">
            {addresses.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  {a.label && <span className="mr-2">{a.label}</span>}
                  {a.isDefault && <Badge tone="success">Основной</Badge>}
                  <div className="text-muted">{[a.postcode, a.city, a.street, a.building, a.apartment && `кв. ${a.apartment}`].filter(Boolean).join(", ")}</div>
                </div>
                <div className="flex gap-4 text-[0.62rem] uppercase tracking-[0.18em]">
                  {!a.isDefault && (
                    <form action={setDefaultAddressAction}><input type="hidden" name="id" value={a.id} /><button className="text-muted hover:text-ink">Основной</button></form>
                  )}
                  <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><button className="text-muted hover:text-danger">Удалить</button></form>
                </div>
              </div>
            ))}
          </div>
        )}
        <AddressForm />
      </section>
      <section>
        <h2 className="mb-4 text-xl">Пароль</h2>
        <PasswordForm />
      </section>
      <section className="border-t border-line pt-8">
        <h2 className="mb-2 text-xl">Ваши данные</h2>
        <p className="mb-4 max-w-xl text-sm text-muted">
          По закону о персональных данных вы можете получить копию всего, что мы храним, или попросить удалить аккаунт. Заказы и чеки сохраняются
          в обезличенном виде, как того требует бухгалтерский учёт.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/account/data-export" className="btn-outline btn-sm">Скачать мои данные (JSON)</a>
          <Link href="/account/support?topic=delete" className="btn-ghost btn-sm text-muted">Запросить удаление аккаунта</Link>
          <Link href="/privacy" className="btn-ghost btn-sm text-muted">Политика обработки ПДн</Link>
        </div>
      </section>
    </div>
  );
}
