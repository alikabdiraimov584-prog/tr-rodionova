import { sendAlert } from "@/lib/alerts";

/**
 * Тревога с сервера (скрипты deploy/*.sh): POST с Bearer CRON_SECRET, поля text и key (JSON или form).
 * Сообщение уходит владельцу в Telegram по настройкам CRM → Интеграции → «Заказы и тревоги в Telegram».
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let text = "";
  let key: string | undefined;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { text?: string; key?: string };
    text = String(body.text ?? "");
    key = body.key ? String(body.key) : undefined;
  } else {
    const form = await request.formData().catch(() => null);
    text = String(form?.get("text") ?? "");
    key = form?.get("key") ? String(form.get("key")) : undefined;
  }
  text = text.trim().slice(0, 2000);
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const r = await sendAlert(text, { key, force: true });
  return Response.json(r);
}
