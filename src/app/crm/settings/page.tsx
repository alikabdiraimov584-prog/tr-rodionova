import type { Metadata } from "next";
import Link from "next/link";
import { requireSection } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { Eyebrow, PageTitle } from "@/components/ui";
import { SettingsForm } from "@/components/crm/admin-forms";

export const metadata: Metadata = { title: "Настройки" };

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function Settings() {
  await requireSection("settings");
  const [brand, delivery, support, seller] = await Promise.all([getSetting("brand"), getSetting("delivery"), getSetting("support"), getSetting("seller")]);
  const rub = (k: number) => k / 100;
  return (
    <div className="space-y-6">
      <PageTitle title="Настройки" actions={<Link href="/crm/settings/channels" className="btn-primary btn-sm">Каналы поддержки</Link>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <Eyebrow>Бренд и контакты</Eyebrow>
          <div className="mt-3">
            <SettingsForm section="brand">
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="label">Название</span><input name="name" defaultValue={brand.name} className="input py-2" /></label>
                <label><span className="label">Слоган</span><input name="tagline" defaultValue={brand.tagline} className="input py-2" /></label>
                <label><span className="label">Телефон</span><input name="phone" defaultValue={brand.phone} className="input py-2" /></label>
                <label><span className="label">Email</span><input name="email" defaultValue={brand.email} className="input py-2" /></label>
                <label className="sm:col-span-2"><span className="label">Telegram</span><input name="telegram" defaultValue={brand.telegram} className="input py-2" /></label>
                <div className="sm:col-span-2 mt-2 border-t border-line pt-3">
                  <div className="eyebrow">Бренд как сущность: для поисковиков и ИИ-ответов</div>
                  <p className="mt-1 text-xs text-muted">Эти данные попадают в разметку schema.org (Organization, Person, Store), в llms.txt и в факты «О бренде». Ссылки на площадки связывают сайт с карточками бренда, по которым ИИ-поисковики подтверждают, что бренд существует.</p>
                </div>
                <label className="sm:col-span-2"><span className="label">Описание бренда (1–2 фактических предложения)</span><textarea name="description" rows={2} defaultValue={brand.description} className="input py-2" /></label>
                <label><span className="label">Год основания</span><input name="foundedYear" defaultValue={brand.foundedYear} className="input py-2" /></label>
                <label><span className="label">Основательница</span><input name="founder" defaultValue={brand.founder} className="input py-2" /></label>
                <label><span className="label">Город</span><input name="city" defaultValue={brand.city} className="input py-2" /></label>
                <label><span className="label">Координаты шоурума (широта, долгота)</span><input name="showroomGeo" defaultValue={brand.showroomGeo} placeholder="55.7570, 37.6017" className="input py-2" /></label>
                <label><span className="label">Instagram</span><input name="instagram" defaultValue={brand.instagram} placeholder="https://instagram.com/…" className="input py-2" /></label>
                <label><span className="label">ВКонтакте</span><input name="vk" defaultValue={brand.vk} placeholder="https://vk.com/…" className="input py-2" /></label>
                <label><span className="label">Pinterest</span><input name="pinterest" defaultValue={brand.pinterest} className="input py-2" /></label>
                <label><span className="label">YouTube</span><input name="youtube" defaultValue={brand.youtube} className="input py-2" /></label>
                <label><span className="label">Дзен</span><input name="dzen" defaultValue={brand.dzen} className="input py-2" /></label>
                <label><span className="label">Яндекс Бизнес (ссылка на карточку)</span><input name="yandexBusiness" defaultValue={brand.yandexBusiness} placeholder="https://yandex.ru/maps/org/…" className="input py-2" /></label>
                <label><span className="label">2ГИС (ссылка на карточку)</span><input name="twoGis" defaultValue={brand.twoGis} className="input py-2" /></label>
                <label><span className="label">Wikidata</span><input name="wikidata" defaultValue={brand.wikidata} placeholder="https://www.wikidata.org/wiki/Q…" className="input py-2" /></label>
                <label className="sm:col-span-2"><span className="label">Публикации о бренде (по одной на строку: «Издание, дата — ссылка»)</span><textarea name="pressLinks" rows={3} defaultValue={brand.pressLinks} placeholder="РБК Стиль, 12.11.2026 — https://style.rbc.ru/…" className="input py-2" /></label>
                <p className="sm:col-span-2 text-xs text-muted">Список показывается на странице «Для прессы» как досье независимых публикаций: по нему журналисты, справочники и Wikidata подтверждают значимость бренда.</p>
              </div>
            </SettingsForm>
            <div className="mt-8">
              <h3 className="mb-1">Реквизиты продавца</h3>
              <p className="mb-3 text-xs text-muted">Показываются в подвале сайта, в оферте и в накладных. Без них сайт не соответствует правилам дистанционной торговли.</p>
              <SettingsForm section="seller">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2"><span className="label">Продавец (ИП / ООО)</span><input name="name" defaultValue={seller.name} placeholder="ИП Родионова Т. А." className="input py-2" /></label>
                  <label><span className="label">ИНН</span><input name="inn" defaultValue={seller.inn} className="input py-2" /></label>
                  <label><span className="label">ОГРН / ОГРНИП</span><input name="ogrn" defaultValue={seller.ogrn} className="input py-2" /></label>
                  <label className="sm:col-span-2"><span className="label">Адрес регистрации</span><input name="address" defaultValue={seller.address} className="input py-2" /></label>
                  <label><span className="label">Режим работы</span><input name="hours" defaultValue={seller.hours} className="input py-2" /></label>
                  <label><span className="label">Шоурум (адрес, часы)</span><input name="showroom" defaultValue={seller.showroom} className="input py-2" /></label>
                  <label className="sm:col-span-2"><span className="label">Адрес для претензий и возвратов</span><input name="claimsAddress" defaultValue={seller.claimsAddress} className="input py-2" /></label>
                  <label><span className="label">Банк</span><input name="bank" defaultValue={seller.bank} className="input py-2" /></label>
                  <label><span className="label">БИК</span><input name="bik" defaultValue={seller.bik} className="input py-2" /></label>
                  <label><span className="label">Расчётный счёт</span><input name="account" defaultValue={seller.account} className="input py-2" /></label>
                  <label><span className="label">Корреспондентский счёт</span><input name="corrAccount" defaultValue={seller.corrAccount} className="input py-2" /></label>
                  <label className="sm:col-span-2"><span className="label">Ответственный за обработку персональных данных</span><input name="responsible" defaultValue={seller.responsible} className="input py-2" /></label>
                </div>
              </SettingsForm>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <Eyebrow>Доставка, ₽</Eyebrow>
          <div className="mt-3">
            <SettingsForm section="delivery">
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className="label">Бесплатно от</span><input name="freeFrom" defaultValue={rub(delivery.freeFrom)} className="input py-2" /></label>
                <label><span className="label">Курьер</span><input name="courier" defaultValue={rub(delivery.courier)} className="input py-2" /></label>
                <label><span className="label">СДЭК</span><input name="cdek" defaultValue={rub(delivery.cdek)} className="input py-2" /></label>
                <label><span className="label">Boxberry</span><input name="boxberry" defaultValue={rub(delivery.boxberry)} className="input py-2" /></label>
                <label><span className="label">Яндекс</span><input name="yandex" defaultValue={rub(delivery.yandex)} className="input py-2" /></label>
              </div>
            </SettingsForm>
          </div>
        </div>
        <div className="card p-5 xl:col-span-2">
          <Eyebrow>Поддержка</Eyebrow>
          <div className="mt-3">
            <SettingsForm section="support">
              <div className="grid gap-3 sm:grid-cols-4">
                <label><span className="label">Начало, час МСК</span><input name="workFrom" type="number" defaultValue={support.workFrom} className="input py-2" /></label>
                <label><span className="label">Конец, час МСК</span><input name="workTo" type="number" defaultValue={support.workTo} className="input py-2" /></label>
                <label><span className="label">Цель первого ответа, мин</span><input name="slaMinutes" type="number" defaultValue={support.slaMinutes} className="input py-2" /></label>
                <label><span className="label">Переоткрывать диалог, дней</span><input name="reopenDays" type="number" defaultValue={support.reopenDays} className="input py-2" /></label>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {DAYS.map((d, i) => <label key={d} className="flex gap-1"><input type="checkbox" name="workDays" value={i + 1} defaultChecked={support.workDays.includes(i + 1)} className="accent-black" />{d}</label>)}
              </div>
              <label className="flex gap-2 text-sm"><input type="checkbox" name="autoReply" defaultChecked={support.autoReply} className="accent-black" /> Автоответ в нерабочее время</label>
              <textarea name="autoReplyText" aria-label="Текст автоответа" rows={3} defaultValue={support.autoReplyText} className="input" />
            </SettingsForm>
          </div>
        </div>
      </div>
    </div>
  );
}
