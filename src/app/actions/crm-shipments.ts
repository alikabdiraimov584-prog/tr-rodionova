"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth";
import { createCdekShipment, syncCdekShipment } from "@/lib/delivery/cdek";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { audit } from "@/lib/audit";

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
