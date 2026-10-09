import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSettingOrDefault } from "@/lib/settings";
import { publicPhone } from "@/lib/seo";

/**
 * Оферта и политика хранятся в docs/legal/*.md с заполнителями в квадратных скобках.
 * При показе на сайте заполнители подставляются из CRM → Настройки (реквизиты продавца, контакты бренда).
 */
export async function legalDoc(name: "offer" | "privacy") {
  const [raw, seller, brand] = await Promise.all([readFile(path.join(process.cwd(), "docs", "legal", `${name}.md`), "utf8"), getSettingOrDefault("seller"), getSettingOrDefault("brand")]);
  const bank = [seller.bank, seller.bik && `БИК ${seller.bik}`, seller.account && `р/с ${seller.account}`, seller.corrAccount && `к/с ${seller.corrAccount}`].filter(Boolean).join(", ");
  const showroom = seller.showroom || "шоурум не открыт, продажи ведутся дистанционно через Сайт";
  const map: Record<string, string> = {
    "[Наименование юрлица / ИП]": seller.name || "[Наименование юрлица / ИП]",
    "[ИНН]": seller.inn || "[ИНН]",
    "[ОГРН/ОГРНИП]": seller.ogrn || "[ОГРН/ОГРНИП]",
    "[Юридический адрес]": seller.address || "[Юридический адрес]",
    "[Почтовый адрес для претензий и возвратов]": seller.claimsAddress || seller.address || "[Почтовый адрес для претензий и возвратов]",
    "[Банковские реквизиты]": bank || "[Банковские реквизиты]",
    "[ФИО ответственного за обработку ПДн]": seller.responsible || seller.name || "[ФИО ответственного за обработку ПДн]",
    "[Адрес шоурума]": showroom,
    "[Почтовый адрес для обращений]": seller.claimsAddress || seller.address || "[Почтовый адрес для обращений]",
    "[Платежный провайдер: ЮKassa или иной]": "платёжному провайдеру (CloudPayments, ООО «КЛАУДПЭЙМЕНТС», или ЮKassa, ООО НКО «ЮМани»)",
    "[Сервис веб-аналитики — при использовании]": "Яндекс Метрика (ООО «Яндекс») — только при согласии на использование cookie",
    "[Наименование оператора фискальных данных]": "оператору фискальных данных облачной кассы (наименование указывается после подключения кассы)",
    "[Наименование сервиса рассылок]": "сервису рассылок (наименование указывается после подключения)",
    "[Телефон]": publicPhone(brand.phone) ?? "",
    "[Регистрационный номер в реестре операторов ПДн]": seller.rknNumber || "(номер будет указан после внесения Оператора в реестр)",
    "[Email]": brand.email,
  };
  let text = raw;
  // телефона нет (в настройках заглушка) — предложения перестраиваются без него, а не «по телефону не указан»
  if (!publicPhone(brand.phone)) {
    text = text
      .replace(/ по телефону \[Телефон\] или по адресу/g, " по адресу")
      .replace(/ по телефону \[Телефон\], на адрес/g, " на адрес")
      .replace(/ или сообщает о возврате по телефону \[Телефон\],/g, ",")
      .replace(/ Обратиться к Продавцу за консультацией можно также по телефону \[Телефон\]\./g, "")
      .replace(/ Телефон для справок: \[Телефон\]\./g, "")
      .replace(/^- Телефон: \[Телефон\]\n/m, "");
  }
  for (const [k, v] of Object.entries(map)) text = text.split(k).join(v);
  // ИП: строка КПП не нужна
  if (!/ООО|АО/.test(seller.name)) text = text.replace(/^- КПП \(для юридического лица\): \[КПП\]\n/m, "");
  return text;
}
