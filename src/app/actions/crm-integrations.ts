"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { byKey } from "@/lib/integrations/registry";
import { getIntegration, recordCheck, saveIntegration } from "@/lib/integrations/store";
import { errorMessage, type ActionState } from "@/lib/action-result";
import { KEY_RE, getIndexNowKey } from "@/lib/indexnow";

export async function saveIntegrationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("integrations");
  const key = String(formData.get("key") ?? "");
  const def = byKey.get(key);
  if (!def) return { error: "Неизвестная интеграция" };
  const input: Record<string, string> = {};
  const clear: string[] = [];
  for (const f of def.fields) {
    input[f.key] = String(formData.get(f.key) ?? "");
    if (formData.get(`clear_${f.key}`) === "on") clear.push(f.key);
  }
  const enabled = formData.get("enabled") === "on";
  if (key === "indexnow" && input.key.trim() && !KEY_RE.test(input.key.trim())) return { error: "Ключ IndexNow: 8–128 латинских букв, цифр или дефисов" };
  try {
    const keys = await saveIntegration(key, input, clear, enabled);
    // ключ IndexNow создаётся сам, когда интеграцию включили с пустым полем
    if (key === "indexnow" && enabled) await getIndexNowKey();
    await audit(me.id, "integration.save", "Integration", key, { enabled, keys });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/crm/integrations");
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "Сохранено, интеграция включена" : "Сохранено" };
}

export async function testIntegrationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("integrations");
  const key = String(formData.get("key") ?? "");
  const def = byKey.get(key);
  if (!def) return { error: "Неизвестная интеграция" };
  if (!def.test) return { ok: true, message: "Для этой интеграции проверка не нужна: достаточно сохранить и включить" };
  const i = await getIntegration(key);
  if (!i) return { error: "Сначала сохраните настройки" };
  let result: Awaited<ReturnType<NonNullable<typeof def.test>>>;
  try {
    result = await def.test(i.config);
  } catch (e) {
    result = { ok: false, error: errorMessage(e) };
  }
  await recordCheck(key, result.ok, result.ok ? null : result.error);
  await audit(me.id, "integration.test", "Integration", key, { ok: result.ok });
  revalidatePath("/crm/integrations");
  return result.ok ? { ok: true, message: `Подключение работает${result.info ? `: ${result.info}` : ""}` } : { error: result.error };
}
