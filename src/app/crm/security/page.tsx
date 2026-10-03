import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { otpauthUrl } from "@/lib/totp";
import { Badge, PageTitle } from "@/components/ui";
import { BeginSetupButton, ConfirmCodeForm, DisableForm } from "@/components/crm/totp-forms";

export const metadata: Metadata = { title: "Безопасность входа" };

export default async function SecurityPage() {
  const me = await requireStaff();
  const enabled = !!me.totpSecret && !!me.totpEnabledAt;
  const pending = !!me.totpSecret && !me.totpEnabledAt;
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle title="Безопасность входа" actions={<Badge tone={enabled ? "success" : "warning"}>{enabled ? "2FA включена" : "2FA выключена"}</Badge>}>
        Второй фактор защищает CRM, если пароль утёк. Код генерирует приложение на телефоне: Яндекс Ключ, Google Authenticator, 1Password, Microsoft Authenticator.
      </PageTitle>
      <div className="card space-y-4 p-5">
        {!me.totpSecret && <BeginSetupButton />}
        {pending && (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Откройте приложение-аутентификатор и добавьте аккаунт вручную: укажите ключ ниже (тип — по времени, 6 цифр, 30 секунд). Или вставьте ссылку в приложение, которое её принимает.</li>
              <li>Введите код из приложения, чтобы подтвердить и включить защиту.</li>
            </ol>
            <div className="rounded-lg bg-sand p-4 text-sm">
              <div className="label">Ключ</div>
              <div className="select-all break-all font-mono text-base tracking-[0.15em]">{me.totpSecret!.match(/.{1,4}/g)!.join(" ")}</div>
              <div className="label mt-3">Ссылка otpauth</div>
              <div className="select-all break-all font-mono text-xs text-muted">{otpauthUrl(me.totpSecret!, me.email)}</div>
            </div>
            <ConfirmCodeForm />
          </>
        )}
        {enabled && (
          <>
            <p className="text-sm">Включена {me.totpEnabledAt!.toLocaleDateString("ru-RU")}. При входе после пароля потребуется код из приложения.</p>
            <DisableForm />
          </>
        )}
      </div>
      <p className="text-xs text-muted">Потеряли телефон — администратор сбросит защиту на странице «Сотрудники», после чего её можно включить заново.</p>
    </div>
  );
}
