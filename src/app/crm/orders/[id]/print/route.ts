import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { formatDate, formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, PAYMENT_METHOD } from "@/lib/labels";

const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Печатные документы к заказу: сборочный лист для склада, товарная накладная для клиентки
 * и бланк заявления на возврат (ЗоЗПП, ст. 26.1: возврат дистанционной покупки в течение 7 дней,
 * у бренда — 14). Открывается в новой вкладке, печать через Ctrl+P.
 */
export async function GET(_req: Request, ctx: RouteContext<"/crm/orders/[id]/print">) {
  const me = await getCurrentUser();
  if (!me || !can(me.role, "orders")) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const order = await db.order.findUnique({ where: { id }, include: { items: { include: { variant: true } }, payments: true, address: true } });
  if (!order) return new Response("Not found", { status: 404 });
  const brand = await getSetting("brand");
  const seller = await getSetting("seller");
  const addr = order.address ? `${order.address.city}, ${order.address.street}, ${order.address.building}${order.address.apartment ? `, кв. ${order.address.apartment}` : ""}` : order.addressText ?? "—";
  const rows = order.items
    .map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.productName)}</td><td>${esc(i.sku)}</td><td>${esc(i.size)}${i.color ? ` / ${esc(i.color)}` : ""}</td><td class="r">${i.quantity}</td><td class="r">${formatMoney(i.price)}</td><td class="r">${formatMoney(i.price * i.quantity)}</td><td class="box"></td></tr>`)
    .join("");
  const returnRows = order.items.map((i) => `<tr><td>${esc(i.productName)}, ${esc(i.size)}</td><td>${esc(i.sku)}</td><td class="r">${formatMoney(i.price)}</td><td class="box"></td><td class="box wide"></td></tr>`).join("");
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заказ №${order.number} — документы</title>
<style>
  body{font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:0;padding:24px;max-width:800px}
  h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;letter-spacing:.04em;text-transform:uppercase}
  .muted{color:#666}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #111;padding-bottom:12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f3f3f3;font-weight:600;font-size:11px}
  .r{text-align:right;white-space:nowrap}.box{width:28px}.wide{width:160px}.sign{display:flex;gap:40px;margin-top:24px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#666}
  .page{page-break-after:always}.note{font-size:11px;color:#444;margin-top:8px}
  @media print{body{padding:0}.noprint{display:none}}
</style></head><body>
<p class="noprint muted">Нажмите Ctrl+P (⌘P) для печати. Три документа: сборочный лист, накладная, бланк возврата.</p>

<section class="page">
  <div class="head"><div><h1>Сборочный лист · заказ №${order.number}</h1><div class="muted">${formatDate(order.createdAt, true)} · ${esc(DELIVERY_METHOD[order.deliveryMethod].label)}${order.fittingRequested ? " · <b>примерка курьером</b>" : ""}${order.isPreorder ? " · предзаказ" : ""}</div></div><div class="r"><b>${esc(brand.name)}</b></div></div>
  <table><thead><tr><th>#</th><th>Наименование</th><th>Артикул</th><th>Размер / цвет</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note">Получатель: ${esc(order.firstName)} ${esc(order.lastName ?? "")}, ${esc(order.phone)}. Адрес: ${esc(addr)}.${order.comment ? ` Комментарий: ${esc(order.comment)}` : ""}</p>
  <div class="sign"><div>Собрал(а), дата</div><div>Проверил(а), дата</div></div>
</section>

<section class="page">
  <div class="head"><div><h1>Товарная накладная к заказу №${order.number}</h1><div class="muted">${formatDate(order.createdAt)}</div></div><div class="r"><b>${esc(seller.name || brand.name)}</b><br>${seller.inn ? `ИНН ${esc(seller.inn)}` : `<span class="muted">ИНН: реквизиты продавца не заполнены</span>`}${seller.ogrn ? `<br>ОГРН/ОГРНИП ${esc(seller.ogrn)}` : ""}${seller.address ? `<br>${esc(seller.address)}` : ""}<br>${esc(brand.phone)} · ${esc(brand.email)}</div></div>
  <p>Покупатель: ${esc(order.firstName)} ${esc(order.lastName ?? "")}, ${esc(order.phone)}, ${esc(order.email)}<br>Доставка: ${esc(DELIVERY_METHOD[order.deliveryMethod].label)}, ${esc(addr)}</p>
  <table><thead><tr><th>#</th><th>Наименование</th><th>Артикул</th><th>Размер / цвет</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td colspan="6" class="r">Товары</td><td class="r">${formatMoney(order.subtotal)}</td><td></td></tr>
  ${order.discount ? `<tr><td colspan="6" class="r">Скидка и баллы Circle</td><td class="r">−${formatMoney(order.discount)}</td><td></td></tr>` : ""}
  ${order.giftUsed ? `<tr><td colspan="6" class="r">Подарочный сертификат</td><td class="r">−${formatMoney(order.giftUsed)}</td><td></td></tr>` : ""}
  <tr><td colspan="6" class="r">Доставка</td><td class="r">${formatMoney(order.deliveryCost)}</td><td></td></tr>
  <tr><td colspan="6" class="r"><b>Итого к оплате</b></td><td class="r"><b>${formatMoney(order.total)}</b></td><td></td></tr></tfoot></table>
  <p class="note">Оплата: ${esc(order.payments[0] ? PAYMENT_METHOD[order.payments[0].method] : "—")}. Кассовый чек направлен на email покупателя (54-ФЗ). Возврат товара надлежащего качества — в течение 14 дней с момента получения (сверх 7 дней по ст. 26.1 Закона «О защите прав потребителей»), при сохранении товарного вида и бирок.</p>
  <div class="sign"><div>Передал(а)</div><div>Получил(а), дата</div></div>
</section>

<section>
  <div class="head"><div><h1>Заявление на возврат товара</h1><div class="muted">к заказу №${order.number} от ${formatDate(order.createdAt)}</div></div><div class="r"><b>${esc(seller.name || brand.name)}</b></div></div>
  <p>Я, ${esc(order.firstName)} ${esc(order.lastName ?? "")}, прошу принять возврат и вернуть уплаченные деньги тем же способом, которым была произведена оплата, в срок не позднее 10 дней с момента предъявления требования (ст. 26.1 Закона «О защите прав потребителей»).</p>
  <table><thead><tr><th>Вещь</th><th>Артикул</th><th class="r">Цена</th><th>Возвр.</th><th>Причина (не подошёл размер / фасон / брак / иное)</th></tr></thead><tbody>${returnRows}</tbody></table>
  <p class="note">Товар не был в употреблении, сохранены товарный вид, бирки и упаковка. ☐ Подтверждаю.</p>
  <div class="sign"><div>Подпись покупателя, дата</div><div>Принял(а) со стороны продавца, дата</div></div>
</section>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
