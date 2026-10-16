import { timingSafeEqual } from "node:crypto";
import { sendAlert } from "@/lib/alerts";
import { readBoundedBody } from "@/lib/read-bounded-body";

/**
 * Тревога с сервера (скрипты deploy/*.sh): POST с Bearer CRON_SECRET, поля text и key (JSON или form).
 * Сообщение уходит владельцу в Telegram по настройкам CRM → Интеграции → «Заказы и тревоги в Telegram».
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  const authorized = expectedBytes.length > 0 && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  if (!authorized) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  // CRON_SECRET authorizes this endpoint to send operational alerts. Bound the body before parsing
  // so a leaked credential cannot be used to force unbounded JSON/form parsing or memory use.
  const bodyText = await readBoundedBody(request, 16 * 1024);
  if (bodyText === null) {
    return Response.json({ error: "invalid or oversized request body" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }

  let text = "";
  let key: string | undefined;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "JSON object required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const fields = body as { text?: unknown; key?: unknown };
    text = typeof fields.text === "string" ? fields.text : "";
    key = typeof fields.key === "string" ? fields.key.slice(0, 100) || undefined : undefined;
  } else if (type.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(bodyText);
    text = form.get("text") ?? "";
    key = form.get("key")?.slice(0, 100) || undefined;
  } else {
    return Response.json({ error: "unsupported content type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }

  text = text.trim().slice(0, 2000);
  if (!text) return Response.json({ error: "text required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const r = await sendAlert(text, { key, force: true });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
