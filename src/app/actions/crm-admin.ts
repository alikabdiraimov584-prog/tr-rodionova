"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSection, hashPassword } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { CHANNEL_FIELDS } from "@/lib/support/channels";
import { decodeChannelConfig, encodeChannelConfig, loadChannel } from "@/lib/support/channel-config";
import { ADAPTERS } from "@/lib/support/channels";
import { checkMailbox } from "@/lib/support/mail-imap";
import { toKopecks } from "@/lib/money";
import { MANUAL_LEDGER_TYPES } from "@/lib/labels";
import { audit } from "@/lib/audit";
import { errorMessage, type ActionState } from "@/lib/action-result";
import type { Channel, LedgerType, Role } from "@/generated/prisma/enums";

// ───────────── Финансы ─────────────

const LedgerSchema = z.object({
  id: z.string().trim().optional(),
  type: z.enum(MANUAL_LEDGER_TYPES as [LedgerType, ...LedgerType[]]),
  amount: z.string().min(1, "Сумма"),
  date: z.string().optional(),
  category: z.string().trim().max(80).optional(),
  counterparty: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(500).optional(),
});

/** Добавить или изменить ручную проводку (расход, прочий доход, взнос или вывод собственника). Проводки заказов не редактируются. */
export async function addLedgerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("finance");
  const parsed = LedgerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const amount = toKopecks(parsed.data.amount);
  if (amount <= 0) return { error: "Сумма должна быть больше нуля" };
  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  if (Number.isNaN(date.getTime())) return { error: "Неверная дата" };
  const data = { type: parsed.data.type as LedgerType, amount, date, category: parsed.data.category || null, counterparty: parsed.data.counterparty || null, comment: parsed.data.comment || null };
  if (parsed.data.id) {
    const cur = await db.ledgerEntry.findUnique({ where: { id: parsed.data.id } });
    if (!cur) return { error: "Проводка не найдена" };
    if (cur.orderId) return { error: "Проводки по заказам меняются только через заказ" };
    await db.ledgerEntry.update({ where: { id: cur.id }, data });
    await audit(me.id, "ledger.update", "LedgerEntry", cur.id, { type: data.type, amount, was: cur.amount });
    revalidatePath("/crm/finance");
    return { ok: true, message: "Проводка изменена" };
  }
  const e = await db.ledgerEntry.create({ data: { ...data, createdBy: me.id } });
  await audit(me.id, "ledger.add", "LedgerEntry", e.id, { type: e.type, amount });
  revalidatePath("/crm/finance");
  return { ok: true, message: "Проводка добавлена" };
}

export async function deleteLedgerAction(formData: FormData) {
  const me = await requireSection("finance");
  const id = String(formData.get("id"));
  const e = await db.ledgerEntry.findUniqueOrThrow({ where: { id } });
  if (e.orderId) throw new Error("Проводки по заказам меняются только через заказ");
  await db.ledgerEntry.delete({ where: { id } });
  await audit(me.id, "ledger.delete", "LedgerEntry", id, { type: e.type, amount: e.amount });
  revalidatePath("/crm/finance");
}

// ───────────── Сотрудники ─────────────

const StaffSchema = z.object({
  firstName: z.string().trim().min(1, "Имя"),
  lastName: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email("Email"),
  phone: z.string().trim().optional(),
  role: z.enum(["SUPPORT", "MANAGER", "ADMIN"]),
});

function tempPassword() {
  return randomBytes(9).toString("base64url");
}

export async function createStaffAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("staff");
  const parsed = StaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Проверьте поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const existing = await db.user.findUnique({ where: { email: d.email } });
  if (existing && existing.role !== "CUSTOMER") return { error: "Сотрудник с таким email уже есть" };
  if (existing) return { error: "Этот email принадлежит клиенту. Используйте рабочий адрес сотрудника." };
  const password = tempPassword();
  let u: { id: string };
  try {
    u = await db.user.create({ data: { ...d, lastName: d.lastName || null, phone: d.phone || null, role: d.role as Role, passwordHash: await hashPassword(password) } });
  } catch (e) {
    const msg = errorMessage(e);
    return { error: msg.includes("Unique") ? "Аккаунт с таким email уже есть" : `Не удалось создать аккаунт: ${msg}` };
  }
  await audit(me.id, "staff.create", "User", u.id, { role: d.role });
  revalidatePath("/crm/staff");
  return { ok: true, message: `Аккаунт создан. Временный пароль: ${password} — передайте сотруднику, он виден один раз.` };
}

export async function updateStaffAction(formData: FormData) {
  const me = await requireSection("staff");
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  if (id === me.id && op !== "role") throw new Error("Нельзя отключить самого себя");
  if (op === "role") {
    const role = String(formData.get("role")) as Role;
    if (id === me.id && role !== "ADMIN") throw new Error("Нельзя снять с себя права администратора");
    if (!["SUPPORT", "MANAGER", "ADMIN"].includes(role)) throw new Error("Недопустимая роль");
    const r = await db.user.updateMany({ where: { id, role: { not: "CUSTOMER" } }, data: { role, sessionVersion: { increment: 1 } } });
    if (r.count === 0) throw new Error("Сотрудник не найден");
    await audit(me.id, "staff.role", "User", id, { role });
  } else if (op === "toggle") {
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    if (u.role === "CUSTOMER") throw new Error("Это клиент, а не сотрудник");
    await db.user.update({ where: { id }, data: { isActive: !u.isActive, sessionVersion: { increment: 1 } } });
    if (u.isActive) {
      // открытые диалоги отключённого сотрудника возвращаются в общую очередь
      await db.conversation.updateMany({ where: { assigneeId: id, status: { not: "CLOSED" } }, data: { assigneeId: null } });
    }
    await audit(me.id, u.isActive ? "staff.disable" : "staff.enable", "User", id);
  }
  revalidatePath("/crm/staff");
}

export async function resetStaffPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("staff");
  const id = String(formData.get("id"));
  const password = tempPassword();
  const r = await db.user.updateMany({ where: { id, role: { not: "CUSTOMER" } }, data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } });
  if (r.count === 0) return { error: "Сотрудник не найден" };
  await audit(me.id, "staff.resetPassword", "User", id);
  return { ok: true, message: `Новый пароль: ${password}` };
}

// ───────────── Настройки ─────────────

export async function saveSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("settings");
  const section = String(formData.get("section"));
  try {
    if (section === "brand") {
      const cur = await getSetting("brand");
      const f = (k: string) => String(formData.get(k) ?? "").trim();
      const url = (k: string) => { const v = f(k); return v && !/^https?:\/\//.test(v) ? `https://${v}` : v; };
      const next = {
        ...cur,
        name: f("name") || cur.name, tagline: f("tagline"), phone: f("phone"), email: f("email"), telegram: url("telegram"),
        description: f("description"), foundedYear: f("foundedYear").replace(/\D/g, "").slice(0, 4), founder: f("founder"), city: f("city"),
        instagram: url("instagram"), vk: url("vk"), pinterest: url("pinterest"), youtube: url("youtube"), dzen: url("dzen"),
        yandexBusiness: url("yandexBusiness"), twoGis: url("twoGis"), wikidata: url("wikidata"), showroomGeo: f("showroomGeo"),
        pressLinks: String(formData.get("pressLinks") ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
      };
      await setSetting("brand", next);
    } else if (section === "finance") {
      const balance = String(formData.get("openingBalance") ?? "").trim();
      const date = String(formData.get("openingDate") ?? "").trim();
      if (date && Number.isNaN(new Date(date).getTime())) return { error: "Неверная дата начала учёта" };
      await setSetting("finance", { openingBalance: balance ? toKopecks(balance) : 0, openingDate: date });
    } else if (section === "seller") {
      const f = (k: string) => String(formData.get(k) ?? "").trim();
      await setSetting("seller", {
        name: f("name"), inn: f("inn").replace(/\D/g, ""), ogrn: f("ogrn").replace(/\D/g, ""), address: f("address"), hours: f("hours"), showroom: f("showroom"),
        bank: f("bank"), bik: f("bik").replace(/\D/g, ""), account: f("account").replace(/\D/g, ""), corrAccount: f("corrAccount").replace(/\D/g, ""), responsible: f("responsible"), claimsAddress: f("claimsAddress"),
      });
    } else if (section === "delivery") {
      const r = (k: string) => toKopecks(String(formData.get(k) ?? "0"));
      await setSetting("delivery", { freeFrom: r("freeFrom"), courier: r("courier"), cdek: r("cdek"), boxberry: r("boxberry"), yandex: r("yandex") });
    } else if (section === "support") {
      const n = (k: string) => Math.trunc(Number(formData.get(k) ?? 0));
      const workFrom = Math.min(23, Math.max(0, n("workFrom")));
      const workTo = Math.min(24, Math.max(workFrom + 1, n("workTo")));
      await setSetting("support", {
        workFrom,
        workTo,
        workDays: formData.getAll("workDays").map(Number).filter((x) => x >= 1 && x <= 7),
        autoReply: formData.get("autoReply") === "on",
        autoReplyText: String(formData.get("autoReplyText") ?? "").trim(),
        slaMinutes: Math.max(1, n("slaMinutes")),
        reopenDays: Math.max(0, n("reopenDays")),
      });
    } else return { error: "Неизвестный раздел" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await audit(me.id, `settings.${section}`, "Setting", section);
  revalidatePath("/crm/settings");
  return { ok: true, message: "Сохранено" };
}

const CHANNEL_NAMES: Record<Channel, string> = { TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", VK: "ВКонтакте", EMAIL: "Email", SMS: "SMS", WEBSITE: "Сайт" };

export async function saveChannelAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("integrations");
  const channel = String(formData.get("channel")) as Exclude<Channel, "WEBSITE">;
  const fields = CHANNEL_FIELDS[channel];
  if (!fields) return { error: "Неизвестный канал" };
  const existing = await db.channelIntegration.findUnique({ where: { channel } });
  const config = { ...((existing?.config as Record<string, string>) ?? {}) };
  for (const f of fields) {
    const v = String(formData.get(f.key) ?? "").trim();
    if (v) config[f.key] = v;
    else if (!f.secret) delete config[f.key];
    if (formData.get(`clear_${f.key}`) === "on") delete config[f.key];
  }
  const enabled = formData.get("enabled") === "on";
  if (channel === "EMAIL") {
    if (config.from && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.from)) return { error: "Адрес отправителя должен быть вида care@tr-rodionova.ru" };
    if (config.smtpPort && !/^\d{2,5}$/.test(config.smtpPort)) return { error: "SMTP-порт — число, обычно 465" };
    if (enabled && !config.smtpHost && !config.postmarkToken) return { error: "Чтобы включить почту, укажите SMTP-сервер и пароль приложения (или Postmark server token)" };
  }
  const stored = encodeChannelConfig(channel, config);
  await db.channelIntegration.upsert({
    where: { channel },
    update: { config: stored, enabled },
    create: { channel, name: CHANNEL_NAMES[channel], config: stored, enabled },
  });
  await audit(me.id, "channel.save", "ChannelIntegration", channel, { enabled, keys: Object.keys(config) });
  revalidatePath("/crm/settings/channels");
  return { ok: true, message: enabled ? "Сохранено, канал включён" : "Сохранено" };
}

export async function rotateWebhookSecretAction(formData: FormData) {
  const me = await requireSection("integrations");
  const channel = String(formData.get("channel")) as Channel;
  await db.channelIntegration.update({ where: { channel }, data: { webhookSecret: randomBytes(18).toString("base64url") } });
  await audit(me.id, "channel.rotate", "ChannelIntegration", channel);
  revalidatePath("/crm/settings/channels");
}

/** Telegram: зарегистрировать вебхук у Bot API с секретным заголовком. */
export async function telegramSetWebhookAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("integrations");
  const base = String(formData.get("baseUrl") ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) return { error: "Нужен публичный https-адрес сайта (APP_URL)" };
  const i = await db.channelIntegration.findUnique({ where: { channel: "TELEGRAM" } });
  const token = i ? decodeChannelConfig("TELEGRAM", i.config).botToken : undefined;
  if (!i || !token) return { error: "Сначала сохраните токен бота" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${base}/api/webhooks/telegram/${i.webhookSecret}`, secret_token: i.webhookSecret, allowed_updates: ["message"] }),
      signal: AbortSignal.timeout(10_000),
    });
    const r = (await res.json()) as { ok: boolean; description?: string };
    await audit(me.id, "channel.telegramWebhook", "ChannelIntegration", "TELEGRAM", { ok: r.ok });
    return r.ok ? { ok: true, message: "Вебхук установлен" } : { error: r.description ?? "Ошибка Telegram" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Почта: тестовое письмо администратору по SMTP (или Postmark) и проверка входа в ящик по IMAP. */
export async function testEmailChannelAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireSection("integrations");
  const to = String(formData.get("to") ?? me.email).trim() || me.email;
  const ch = await loadChannel("EMAIL");
  if (!ch) return { error: "Сначала сохраните настройки канала" };
  const adapter = ADAPTERS.EMAIL!;
  const brand = await getSetting("brand");
  const parts: string[] = [];
  let ok = true;
  const sent = await adapter.send(ch.config, to, `Это тестовое письмо с сайта ${brand.name}. Если вы его видите, отправка почты настроена.\n\n— ${brand.name}`, "Проверка почты сайта").catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "ошибка" }));
  if (sent.ok) parts.push(`Письмо отправлено на ${to}${ch.config.smtpHost ? ` через ${ch.config.smtpHost}` : " через Postmark"}`);
  else { ok = false; parts.push(`Отправка: ${sent.error}`); }
  if (ch.config.smtpHost) {
    const imap = await checkMailbox(ch.config);
    if (imap.ok) parts.push(imap.info);
    else { ok = false; parts.push(imap.error); }
  }
  await db.channelIntegration.update({ where: { id: ch.id }, data: ok ? { lastError: null } : { lastError: parts.filter((p) => /^(Отправка|IMAP)/.test(p)).join("; ") } });
  await audit(me.id, "channel.test", "ChannelIntegration", "EMAIL", { ok });
  revalidatePath("/crm/settings/channels");
  return ok ? { ok: true, message: parts.join(". ") } : { error: parts.join(". ") };
}
