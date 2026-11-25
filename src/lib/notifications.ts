import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { ADAPTERS } from "@/lib/support/channels";
import { loadChannel } from "@/lib/support/channel-config";
import { formatMoney } from "@/lib/money";
import { DELIVERY_METHOD, PAYMENT_METHOD } from "@/lib/labels";
import { activeIntegration } from "@/lib/integrations/store";
import { sendTelegramMessage } from "@/lib/alerts";
import type { Channel } from "@/generated/prisma/enums";
import { publicPhone } from "@/lib/seo";
import { yandexTrackingLink } from "@/lib/delivery";

/**
 * Сервисные уведомления: статусы заказа. Это не рассылки, поэтому согласие на маркетинг
 * не требуется. Email уходит всегда, когда канал подключён; SMS — только для событий, где
 * важна скорость (отправка и доставка заказа). Каждая попытка пишется в Notification,
 * ошибки отправки никогда не ломают действие, которое их вызвало.
 */

export type OrderEventKind = "ORDER_CREATED" | "ORDER_PAID" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED" | "COURIER_SOON";

const SMS_EVENTS: OrderEventKind[] = ["ORDER_SHIPPED", "ORDER_DELIVERED", "COURIER_SOON"];

function siteUrl() {
  return process.env.APP_URL ?? "https://tr-rodionova.ru";
}

export async function sendVia(channel: Channel, address: string, text: string, subject: string | null): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; error?: string }> {
  const integration = await loadChannel(channel);
  const adapter = ADAPTERS[channel];
  if (!integration?.enabled || !adapter) return { status: "SKIPPED", error: "Канал не подключён" };
  let result: { status: "SENT" | "FAILED"; error?: string };
  try {
    const r = await adapter.send(integration.config, address, text, subject);
    result = r.ok ? { status: "SENT" } : { status: "FAILED", error: r.error };
  } catch (e) {
    result = { status: "FAILED", error: e instanceof Error ? e.message : "Сеть недоступна" };
  }
  // сбой отправки виден в карточке канала (CRM → Настройки → Каналы), успех снимает старую ошибку
  await db.channelIntegration.update({ where: { id: integration.id }, data: result.status === "FAILED" ? { lastError: result.error ?? "Ошибка отправки" } : { lastError: null } }).catch(() => null);
  return result;
}

async function dispatch(input: { userId?: string | null; orderId?: string | null; event: string; subject: string | null; text: string; email?: string | null; phone?: string | null; sms?: string | null }) {
  const targets: { channel: Channel; address: string; text: string; subject: string | null }[] = [];
  if (input.email) targets.push({ channel: "EMAIL", address: input.email, text: input.text, subject: input.subject });
  const digits = input.phone?.replace(/\D/g, "") ?? "";
  if (input.sms && digits.length >= 10) targets.push({ channel: "SMS", address: digits, text: input.sms, subject: null });
  for (const t of targets) {
    const r = await sendVia(t.channel, t.address, t.text, t.subject);
    await db.notification.create({
      data: { userId: input.userId ?? null, orderId: input.orderId ?? null, event: input.event, channel: t.channel, address: t.address, subject: t.subject, text: t.text, status: r.status, error: r.error ?? null },
    });
  }
}

function signature(brand: { name: string; phone: string; email: string }) {
  return `\n\n— ${brand.name}\n${[publicPhone(brand.phone), brand.email].filter(Boolean).join(" · ")}`;
}

/** Уведомление по событию заказа. Вызывать после фиксации транзакции; ошибки гасятся. */
export async function notifyOrder(orderId: string, event: OrderEventKind) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: { select: { method: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    if (!order) return;
    const brand = await getSetting("brand");
    const method = order.payments[0]?.method;
    // при получении деньги отдают курьеру или в пункте выдачи — даже когда в CRM заказ уже переведён в «Оплачен»,
    // чтобы его собрать: в письмах об отправке и курьере — сколько приготовить
    const cod = method === "CASH_ON_DELIVERY" && order.total > 0;
    const due = cod ? `\nК оплате при получении: ${formatMoney(order.total)}.` : "";
    const n = `№${order.number}`;
    const link = `${siteUrl()}/account/orders/${order.id}`;
    const items = order.items.map((i) => `· ${i.productName}, ${i.size}${i.color ? `, ${i.color}` : ""} × ${i.quantity}`).join("\n");
    const hi = `${order.firstName}, здравствуйте.`;
    let subject = "";
    let text = "";
    let sms: string | null = null;
    switch (event) {
      case "ORDER_CREATED": {
        subject = `Заказ ${n} принят`;
        // что делать дальше, зависит от способа оплаты: онлайн — подтверждение придёт само, при получении — ничего,
        // переводом — реквизиты прямо в письме
        let next = `Подробности: ${link}`;
        if (order.status === "NEW" && order.total > 0) {
          if (method === "CASH_ON_DELIVERY") next = `Оплата при получении: ${order.deliveryMethod === "PICKUP" ? "в шоуруме" : order.deliveryMethod === "COURIER" ? "курьеру" : "в пункте выдачи"}. Когда передадим заказ в доставку, напишем.\n\nЗаказ в личном кабинете: ${link}`;
          else if (method === "MANUAL") {
            const seller = await getSetting("seller");
            next = seller.account
              ? `Оплата переводом по реквизитам:\nПолучатель: ${seller.name}\nИНН: ${seller.inn}\nБанк: ${seller.bank}, БИК ${seller.bik}\nРасчётный счёт: ${seller.account}${seller.corrAccount ? `\nКорр. счёт: ${seller.corrAccount}` : ""}\nСумма: ${formatMoney(order.total)}\nНазначение платежа: оплата заказа ${n}\n\nКогда деньги поступят, пришлём подтверждение. Заказ в личном кабинете: ${link}`
              : `Оплата переводом по реквизитам: реквизиты и сумма — на странице заказа: ${link}`;
          } else next = `Как только оплата пройдёт, пришлём подтверждение. Если оплатить не получилось, вернуться к оплате можно здесь: ${order.paymentUrl ?? link}`;
        }
        text = `${hi}\n\nМы приняли ваш заказ ${n} на ${formatMoney(order.total)}${method ? ` (${PAYMENT_METHOD[method].toLowerCase()})` : ""}.\n\n${items}\n\n${next}`;
        break;
      }
      case "ORDER_PAID":
        // при получении «Оплачен» в CRM значит «подтверждён к сборке»: денег ещё нет, благодарить за оплату рано
        subject = cod ? `Заказ ${n} подтверждён` : `Заказ ${n} оплачен`;
        text = `${hi}\n\n${cod ? `Заказ ${n} подтверждён, мы начали собирать посылку` : `Оплата заказа ${n} получена, спасибо. Мы начали собирать посылку`}${order.isPreorder ? "; вещи по предзаказу отшиваются под вас" : ""}.${due}\n\nСпособ получения: ${DELIVERY_METHOD[order.deliveryMethod].label}.\nСледить за статусом: ${link}`;
        break;
      case "ORDER_SHIPPED":
        subject = `Заказ ${n} передан в доставку`;
        text = `${hi}\n\nЗаказ ${n} передан в доставку (${DELIVERY_METHOD[order.deliveryMethod].label}).${order.deliverySlot ? `\nИнтервал доставки: ${order.deliverySlot}.` : ""}${order.fittingRequested ? "\nКурьер подождёт до 20 минут на примерку." : ""}${order.trackingNumber ? `\nТрек-номер: ${order.trackingNumber}` : ""}${yandexTrackingLink(order.shipmentData) ? `\nСледить за курьером на карте: ${yandexTrackingLink(order.shipmentData)}` : ""}${due}\n\nСледить за статусом: ${link}`;
        sms = `T.Rodionova: заказ ${n} передан в доставку.${order.deliverySlot ? ` Интервал ${order.deliverySlot}.` : ""}${order.trackingNumber ? ` Трек ${order.trackingNumber}.` : ""}`;
        break;
      case "COURIER_SOON":
        subject = `Курьер с заказом ${n} будет в течение часа`;
        text = `${hi}\n\nКурьер с заказом ${n} будет у вас в течение часа.${order.fittingRequested ? " На примерку есть до 20 минут: оплатите только то, что подошло." : ""}${due}\n\nЕсли планы изменились, ответьте на это письмо или позвоните нам.`;
        sms = `T.Rodionova: курьер с заказом ${n} будет в течение часа.${order.fittingRequested ? " Примерка до 20 минут." : ""}`;
        break;
      case "ORDER_DELIVERED":
        subject = `Заказ ${n} доставлен`;
        text = `${hi}\n\nЗаказ ${n} доставлен. Надеемся, вещи сели так, как вы ждали.\n\nЕсли что-то не подошло, вернуть можно в течение 14 дней: ${siteUrl()}/delivery.`;
        sms = `T.Rodionova: заказ ${n} доставлен. Возврат — 14 дней.`;
        break;
      case "ORDER_CANCELLED": {
        subject = `Заказ ${n} отменён`;
        // причина из ленты заказа: «Резерв снят: заказ не оплачен в течение 24 часов» и т. п.
        const ev = await db.orderEvent.findFirst({ where: { orderId: order.id, status: "CANCELLED" }, orderBy: { createdAt: "desc" }, select: { message: true } });
        const reason = ev?.message.replace(/^Заказ отменён:?\s*/, "").trim();
        const unpaid = !!reason && /не оплачен/.test(reason);
        const why = unpaid ? ": оплата не поступила за 24 часа, и резерв снят" : reason ? `: ${reason.charAt(0).toLowerCase()}${reason.slice(1).replace(/\.$/, "")}` : "";
        text = `${hi}\n\nЗаказ ${n} отменён${why}.${unpaid ? ` Если вещи ещё нужны, оформите заказ заново: ${siteUrl()}/cart` : ""}\n\nЕсли отмена произошла по ошибке, ответьте на это письмо.`;
        break;
      }
    }
    await dispatch({ userId: order.userId, orderId: order.id, event, subject, text: text + signature(brand), email: order.email, phone: order.phone, sms: SMS_EVENTS.includes(event) ? sms : null });
  } catch (e) {
    console.error("notifyOrder", event, orderId, e);
  }
}

/**
 * Напоминания о неоплаченном заказе (сервисные, без согласия на рассылки):
 * PAYMENT_REMINDER через 2 часа после оформления, PAYMENT_LAST_CALL за час до снятия резерва (24 ч).
 * Оплата при получении и перевод по реквизитам не торопятся: там платёж идёт вне сайта.
 */
export async function notifyUnpaidOrders(now = new Date()) {
  const h = 3_600_000;
  const orders = await db.order.findMany({
    where: { status: "NEW", total: { gt: 0 }, createdAt: { gte: new Date(now.getTime() - 24 * h), lte: new Date(now.getTime() - 2 * h) }, payments: { some: { status: "PENDING", method: { in: ["CARD", "SBP", "INSTALLMENT"] } } } },
    select: { id: true, number: true, firstName: true, email: true, phone: true, total: true, paymentUrl: true, userId: true, createdAt: true },
  });
  if (orders.length === 0) return 0;
  const sent = await db.notification.findMany({ where: { orderId: { in: orders.map((o) => o.id) }, event: { in: ["PAYMENT_REMINDER", "PAYMENT_LAST_CALL"] } }, select: { orderId: true, event: true } });
  const has = (id: string, ev: string) => sent.some((x) => x.orderId === id && x.event === ev);
  const brand = await getSetting("brand");
  let n = 0;
  for (const o of orders) {
    const age = now.getTime() - o.createdAt.getTime();
    const lastCall = age >= 23 * h;
    const event = lastCall ? "PAYMENT_LAST_CALL" : "PAYMENT_REMINDER";
    if (has(o.id, event)) continue;
    const link = o.paymentUrl ?? `${siteUrl()}/account/orders/${o.id}`;
    const text = lastCall
      ? `${o.firstName}, здравствуйте.\n\nЧерез час резерв по заказу №${o.number} (${formatMoney(o.total)}) снимается, и вещи вернутся в продажу. Оплатить сейчас: ${link}`
      : `${o.firstName}, здравствуйте.\n\nЗаказ №${o.number} на ${formatMoney(o.total)} ждёт оплаты, вещи зарезервированы за вами на 24 часа. Оплатить: ${link}\n\nЕсли передумали, ничего делать не нужно: резерв снимется сам.`;
    await dispatch({ userId: o.userId, orderId: o.id, event, subject: lastCall ? `Резерв по заказу №${o.number} снимается через час` : `Заказ №${o.number} ждёт оплаты`, text: text + signature(brand), email: o.email, phone: o.phone, sms: lastCall ? `T.Rodionova: заказ №${o.number} ждёт оплаты, через час резерв снимется. ${link}` : null });
    n++;
  }
  return n;
}

/** Через 10 дней после получения: как сели вещи, уход за тканью, просьба об отзыве. Один раз на заказ. */
export async function notifyReviewRequests(now = new Date()) {
  const d = 86_400_000;
  const orders = await db.order.findMany({
    where: { status: { in: ["DELIVERED", "COMPLETED"] }, userId: { not: null }, deliveredAt: { gte: new Date(now.getTime() - 14 * d), lte: new Date(now.getTime() - 10 * d) } },
    include: { items: { include: { variant: { include: { product: { select: { id: true, name: true, care: true, composition: true } } } } } }, user: { select: { id: true, isActive: true, reviews: { select: { productId: true } } } } },
  });
  if (orders.length === 0) return 0;
  const sent = new Set((await db.notification.findMany({ where: { orderId: { in: orders.map((o) => o.id) }, event: "REVIEW_REQUEST" }, select: { orderId: true } })).map((x) => x.orderId));
  const brand = await getSetting("brand");
  let n = 0;
  for (const o of orders) {
    if (sent.has(o.id) || !o.user?.isActive) continue;
    const reviewed = new Set(o.user.reviews.map((r) => r.productId));
    const pending = o.items.filter((i) => i.quantity - i.returnedQty > 0 && !reviewed.has(i.variant.product.id));
    if (pending.length === 0) continue;
    const care = pending.map((i) => i.variant.product.care ? `· ${i.productName}: ${i.variant.product.care}` : null).filter(Boolean).join("\n");
    const text = `${o.firstName}, здравствуйте.\n\nПрошло десять дней с доставки заказа №${o.number}. Надеемся, вещи уже стали частью гардероба.${care ? `\n\nКак ухаживать:\n${care}` : ""}\n\nБудем благодарны за пару слов о покупке: отзыв помогает другим клиенткам выбрать размер и посадку.\nОставить отзыв: ${siteUrl()}/account/orders/${o.id}`;
    await dispatch({ userId: o.userId, orderId: o.id, event: "REVIEW_REQUEST", subject: `Как вам вещи из заказа №${o.number}?`, text: text + signature(brand), email: o.email, sms: null });
    n++;
  }
  return n;
}

/** Напоминание о корзине: только с согласием на рассылки и не чаще раза в 7 дней. */
export async function notifyAbandonedCarts(now = new Date()) {
  const from = new Date(now.getTime() - 3 * 86_400_000);
  const to = new Date(now.getTime() - 20 * 3_600_000);
  const rows = await db.cartItem.groupBy({ by: ["userId"], where: { updatedAt: { gte: from, lte: to }, variant: { archivedAt: null } }, _max: { updatedAt: true } });
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.userId);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [recent, users] = await Promise.all([
    db.notification.findMany({ where: { event: "CART_REMINDER", createdAt: { gte: weekAgo }, userId: { in: ids } }, select: { userId: true } }),
    db.user.findMany({ where: { id: { in: ids }, marketingConsent: true, isActive: true, role: "CUSTOMER" }, select: { id: true, email: true, firstName: true, unsubscribeToken: true, cart: { where: { variant: { archivedAt: null } }, include: { variant: { include: { product: { select: { name: true, slug: true, price: true } } } } } } } }),
  ]);
  const skip = new Set(recent.map((r) => r.userId));
  const brand = await getSetting("brand");
  let n = 0;
  for (const u of users) {
    if (skip.has(u.id) || u.cart.length === 0) continue;
    const lines = u.cart.map((c) => `· ${c.variant.product.name}, ${c.variant.size} — ${formatMoney(c.variant.price ?? c.variant.product.price)}`).join("\n");
    const text = `${u.firstName}, здравствуйте.\n\nВ вашей корзине остались вещи:\n${lines}\n\nОни ждут вас: ${siteUrl()}/cart${signature(brand)}\n\nОтписаться от рассылок: ${siteUrl()}/unsubscribe/${u.unsubscribeToken}`;
    await dispatch({ userId: u.id, event: "CART_REMINDER", subject: "Вещи в вашей корзине", text, email: u.email, sms: null });
    n++;
  }
  return n;
}

/**
 * Владельцу о новом заказе — в Telegram из CRM → Интеграции → «Заказы и тревоги в Telegram»: оплаченный онлайн (kind "paid")
 * или оформленный с оплатой при получении и переводом (kind "created" — деньги придут позже, а собирать уже пора).
 */
export async function notifyStaffOrder(orderId: string, kind: "paid" | "created") {
  try {
    const i = await activeIntegration("telegram_alerts");
    if (!i?.config.botToken || !i.config.chatId) return;
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: { select: { method: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    if (!order) return;
    const method = order.payments[0]?.method;
    // заказ «при получении» владелец уже видел при оформлении; «Оплачен» в CRM ставит он сам, чтобы собрать заказ
    if (kind === "paid" && method === "CASH_ON_DELIVERY") return;
    const head =
      kind === "paid"
        ? `🛍 Оплачен заказ №${order.number} — ${formatMoney(order.total)}${method ? `, ${PAYMENT_METHOD[method].toLowerCase()}` : ""}`
        : `🛍 Новый заказ №${order.number} — ${formatMoney(order.total)}, ${method === "MANUAL" ? "ждёт перевода по реквизитам" : "оплата при получении"}`;
    const items = order.items.map((x) => `· ${x.productName}, ${x.size}${x.color ? `, ${x.color}` : ""} × ${x.quantity}`).join("\n");
    const delivery = `${DELIVERY_METHOD[order.deliveryMethod].label}${order.deliverySlot ? `, ${order.deliverySlot}` : ""}${order.fittingRequested ? ", примерка курьером" : ""}${order.isPreorder ? ", предзаказ" : ""}`;
    const text = `${head}\n${items}\n${delivery}\n${order.firstName} ${order.lastName ?? ""}`.trimEnd() + `, ${order.phone}\n${siteUrl()}/crm/orders/${order.id}`;
    await sendTelegramMessage(i.config.botToken, i.config.chatId, text);
  } catch (e) {
    console.error("notifyStaffOrder", orderId, e);
  }
}

/** Новая клиентка: как войти. Аккаунт, созданный при оформлении заказа, — без пароля, вход по коду. */
export async function notifyWelcome(userId: string, via: "register" | "checkout") {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
    if (!user) return;
    const brand = await getSetting("brand");
    const account =
      via === "checkout"
        ? `Мы создали для вас личный кабинет при оформлении заказа: там статус заказа и история покупок. Пароль не нужен — войти можно по коду из письма: ${siteUrl()}/login («Войти по коду из письма»).`
        : `Ваш личный кабинет: ${siteUrl()}/account — заказы, избранное и мерки для подбора размера.`;
    const text = `${user.firstName}, здравствуйте.\n\nДобро пожаловать в ${brand.name}.\n\n${account}${signature(brand)}`;
    await dispatch({ userId, event: "WELCOME", subject: `Добро пожаловать в ${brand.name}`, text, email: user.email, sms: null });
  } catch (e) {
    console.error("notifyWelcome", userId, e);
  }
}

/**
 * Подарочный сертификат оплачен: получателю — письмо с кодом и словами дарителя (форма обещает это письмо),
 * покупателю — подтверждение с кодом. Без email получателя код отправляется только покупателю.
 */
export async function notifyGiftCard(cardId: string) {
  try {
    const card = await db.giftCard.findUnique({ where: { id: cardId }, include: { purchaser: { select: { id: true, email: true, firstName: true, lastName: true } } } });
    if (!card || card.status !== "ACTIVE") return;
    const brand = await getSetting("brand");
    const until = card.expiresAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    const howTo = `Как воспользоваться: при оформлении заказа на ${siteUrl()} откройте «Промокод или подарочный сертификат» и введите код — или назовите его в шоуруме. Остаток сохраняется на следующую покупку.`;
    if (card.recipientEmail) {
      const from = card.purchaser ? `${card.purchaser.firstName}${card.purchaser.lastName ? ` ${card.purchaser.lastName}` : ""}` : "Близкий вам человек";
      const text = `${card.recipientName ? `${card.recipientName}, здравствуйте.` : "Здравствуйте."}\n\n${from} дарит вам подарочный сертификат ${brand.name} на ${formatMoney(card.amount)}.${card.message ? `\n\n«${card.message}»` : ""}\n\nКод сертификата: ${card.code}\nДействует до ${until}\n\n${howTo}${signature(brand)}`;
      await dispatch({ userId: null, event: "GIFT_CARD_RECIPIENT", subject: `Вам подарочный сертификат ${brand.name}`, text, email: card.recipientEmail, sms: null });
    }
    if (card.purchaser) {
      const sent = card.recipientEmail ? `Мы отправили его на ${card.recipientEmail}${card.message ? " вместе с вашими словами" : ""}.` : "Перешлите код получателю или покажите страницу сертификата в личном кабинете.";
      const text = `${card.purchaser.firstName}, здравствуйте.\n\nСертификат ${brand.name} на ${formatMoney(card.amount)} оплачен. ${sent}\n\nКод: ${card.code}\nДействует до ${until}\nСертификат в личном кабинете: ${siteUrl()}/account/giftcards/${card.id}${signature(brand)}`;
      await dispatch({ userId: card.purchaser.id, event: "GIFT_CARD_PAID", subject: `Сертификат на ${formatMoney(card.amount)} оплачен`, text, email: card.purchaser.email, sms: null });
    }
  } catch (e) {
    console.error("notifyGiftCard", cardId, e);
  }
}

/**
 * Сообщение клиентке в чате личного кабинета (ответ поддержки, стилиста, вещь снова в наличии): копия на почту,
 * иначе она узнает об ответе, только когда зайдёт на сайт. Не чаще раза в 10 минут на клиентку — несколько
 * ответов подряд не превращаются в поток писем.
 */
export async function notifySiteMessage(userId: string, text: string, opts: { subject?: string; force?: boolean; raw?: boolean } = {}) {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, isActive: true } });
    if (!user?.isActive) return;
    if (!opts.force) {
      const recent = await db.notification.count({ where: { userId, event: "SITE_MESSAGE", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      if (recent > 0) return;
    }
    const brand = await getSetting("brand");
    const body = opts.raw
      ? `${user.firstName}, здравствуйте.\n\n${text}${signature(brand)}`
      : `${user.firstName}, здравствуйте.\n\nНовое сообщение от ${brand.name}:\n\n${text}\n\nОтветить можно в личном кабинете: ${siteUrl()}/account/support${signature(brand)}`;
    await dispatch({ userId, event: "SITE_MESSAGE", subject: opts.subject ?? `Новое сообщение от ${brand.name}`, text: body, email: user.email, sms: null });
  } catch (e) {
    console.error("notifySiteMessage", userId, e);
  }
}
