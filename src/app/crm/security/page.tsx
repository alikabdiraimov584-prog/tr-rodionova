import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { otpauthUrl } from "@/lib/totp";
import QRCode from "qrcode";
import { Badge, PageTitle } from "@/components/ui";
import { BeginSetupButton, ConfirmCodeForm, DisableForm } from "@/components/crm/totp-forms";

export const metadata: Metadata = { title: "Безопасность входа" };

export default async function SecurityPage() {
  const me = await requireStaff();
  const enabled = !!me.totpSecret && !!me.totpEnabledAt;
  const pending = !!me.totpSecret && !me.totpEnabledAt;
  // QR-код рисуется на сервере в SVG: секрет не уходит ни в какие внешние сервисы
  const qr = pending ? await QRCode.toString(otpauthUrl(me.totpSecret!, me.email), { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" }) : null;
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
              <li>Откройте приложение-аутентификатор (Яндекс Ключ, Google Authenticator, 1Password) и отсканируйте QR-код. Если камеры нет, добавьте аккаунт вручную по ключу ниже (по времени, 6 цифр, 30 секунд).</li>
              <li>Введите код из приложения, чтобы подтвердить и включить защиту.</li>
            </ol>
            <div className="flex flex-wrap items-start gap-5 rounded-lg bg-sand p-4 text-sm">
              {qr && <div className="shrink-0 rounded-lg bg-white p-2" aria-label="QR-код для приложения-аутентификатора" dangerouslySetInnerHTML={{ __html: qr }} />}
              <div className="min-w-0 flex-1">
              <div className="label">Ключ</div>
              <div className="select-all break-all font-mono text-base tracking-[0.15em]">{me.totpSecret!.match(/.{1,4}/g)!.join(" ")}</div>
              <div className="label mt-3">Ссылка otpauth</div>
              <div className="select-all break-all font-mono text-xs text-muted">{otpauthUrl(me.totpSecret!, me.email)}</div>
              </div>
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
