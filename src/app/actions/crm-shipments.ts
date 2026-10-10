"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth";
import { createCdekShipment, syncCdekShipment } from "@/lib/delivery/cdek";
import { acceptYandexClaim, cancelYandexClaim, createYandexClaim, syncYandexClaim, yandexStatusLabel } from "@/lib/delivery/yandex";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";

// ───────────────────────────── Яндекс Доставка ─────────────────────────────

export async function createYandexClaimAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  let message: string;
  try {
    const s = await createYandexClaim(orderId, staff.id);
    await audit(staff.id, "shipment.create", "Order", orderId, { provider: "yandex", claimId: s.claimId, status: s.status });
    message =
      s.status === "ready_for_approval"
        ? `Оценка: ${s.price ? formatMoney(s.price) : "цена уточняется"}. Подтвердите заявку — и Яндекс начнёт искать курьера`
        : s.status === "estimating_failed"
          ? `Оценка не удалась: ${s.error ?? "уточните адрес"}`
          : `Заявка создана: ${yandexStatusLabel(s.status)}. Обновите статус через несколько секунд`;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message };
}

export async function acceptYandexClaimAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  try {
    const s = await acceptYandexClaim(orderId, staff.id);
    await audit(staff.id, "shipment.accept", "Order", orderId, { provider: "yandex", claimId: s.claimId, price: s.price });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message: "Заявка подтверждена: ищем курьера" };
}

export async function syncYandexClaimAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  let status: string;
  try {
    status = (await syncYandexClaim(orderId, staff.id)).status;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  revalidatePath("/crm", "layout");
  return { ok: true, message: `Яндекс Доставка: ${yandexStatusLabel(status)}` };
}

/** Отмена: платная отмена требует второго нажатия с confirmPaid=1 — возвращаем code PAID_CANCEL и цену. */
export async function cancelYandexClaimAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  const confirmPaid = formData.get("confirmPaid") === "1";
  try {
    const r = await cancelYandexClaim(orderId, staff.id, { confirmPaid });
    if (!r.cancelled) return { code: "PAID_CANCEL", error: `Курьер уже назначен: отмена платная${r.price ? ` — ${formatMoney(r.price)}` : ""}. Нажмите «Отменить платно», если согласны` };
    await audit(staff.id, "shipment.cancel", "Order", orderId, { provider: "yandex", paid: r.paid, price: r.price });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message: "Заявка отменена" };
}

// ───────────────────────────── СДЭК ─────────────────────────────

export async function createCdekShipmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  try {
    const uuid = await createCdekShipment(orderId, staff.id);
    await audit(staff.id, "shipment.create", "Order", orderId, { provider: "cdek", uuid });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  return { ok: true, message: "Отправление создано" };
}

export async function syncCdekShipmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const staff = await requireSection("ordersEdit");
  const orderId = String(formData.get("orderId"));
  let status: string;
  try {
    status = (await syncCdekShipment(orderId, staff.id)).status;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/crm/orders/${orderId}`);
  revalidatePath("/crm", "layout");
  return { ok: true, message: `Статус СДЭК: ${status}` };
}
