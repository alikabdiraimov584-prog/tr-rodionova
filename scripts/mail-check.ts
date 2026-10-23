// Диагностика почты сайта на сервере: настройки канала Email (без пароля), соединение с SMTP, последние письма
// с причинами сбоев и, если указан адрес, тестовое письмо. Ничего не меняет в настройках.
// Запуск: cd /opt/tr-rodionova && sudo -u deploy bash deploy/mail-check.sh [куда@прислать.тест]
import "dotenv/config";
import { db } from "@/lib/db";
import { loadChannel } from "@/lib/support/channel-config";
import { ADAPTERS, smtpError, smtpSettings, smtpTransport } from "@/lib/support/channels";

const mask = (a: string) => a.replace(/^(.)[^@]*(@.*)$/, "$1***$2");
const line = (s = "") => console.log(s);

function hintFor(error: string) {
  if (/логин или пароль|535|auth/i.test(error))
    return "Пароль не подошёл. Создайте новый пароль приложения: Яндекс ID → Безопасность → Пароли приложений → Почта, и вставьте его в CRM → Настройки → Каналы → Email. Логин — полный адрес ящика, в котором создан пароль.";
  if (/Нет соединения|ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNECTION|ENOTFOUND/i.test(error))
    return "Сервер не может достучаться до почтового сервера. Часто хостер закрывает исходящие порты 465/587: попросите поддержку хостинга открыть исходящий SMTP или поставьте порт 587.";
  if (/Не заполнены|Не настроена/i.test(error)) return "Заполните в CRM → Настройки → Каналы → Email: адрес отправителя, SMTP-сервер, порт, логин и пароль приложения.";
  if (/отклонил адрес|sender|from/i.test(error)) return "Почтовый сервер не принимает адрес отправителя: он должен совпадать с логином SMTP или быть его подтверждённым алиасом.";
  return "";
}

async function main() {
  const to = (process.argv[2] ?? "").trim();
  line("== Канал Email");
  const ch = await loadChannel("EMAIL");
  if (!ch) {
    line("Канал не создан: CRM → Настройки → Каналы → Email. Пока его нет, сайт не отправляет ни одного письма.");
  } else {
    const c = ch.config;
    const s = smtpSettings(c);
    line(`включён: ${ch.enabled ? "да" : "НЕТ — письма не отправляются"}`);
    line(`отправитель: ${c.fromName ? `${c.fromName} ` : ""}<${c.from || "НЕ УКАЗАН"}>`);
    line(`SMTP: ${s.host || "НЕ УКАЗАН"}:${s.port}  логин: ${s.user || "НЕ УКАЗАН"}  пароль: ${s.pass ? `задан (${s.pass.length} симв.)` : "ПУСТОЙ или не расшифрован (см. предупреждение выше)"}`);
    if (c.postmarkToken) line("Postmark: токен задан");
    if (s.user && c.from && s.user.toLowerCase() !== c.from.toLowerCase()) line(`внимание: адрес отправителя (${c.from}) отличается от логина SMTP (${s.user}) — Яндекс пропустит его, только если это алиас этого ящика`);
    line(`последняя ошибка отправки: ${ch.lastError ?? "нет"}`);

    if (s.host) {
      line("\n== Соединение с SMTP");
      try {
        await smtpTransport(c).verify();
        line("ok: сервер принял логин и пароль");
      } catch (e) {
        const err = smtpError(e);
        line(`ОШИБКА: ${err}`);
        const h = hintFor(err);
        if (h) line(`что сделать: ${h}`);
      }
    }
  }

  line("\n== Последние письма сайта");
  const rows = await db.notification.findMany({ where: { channel: "EMAIL" }, orderBy: { createdAt: "desc" }, take: 12, select: { createdAt: true, event: true, status: true, error: true, address: true } });
  if (!rows.length) line("писем ещё не было");
  for (const r of rows) line(`${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC  ${r.event.padEnd(18)} ${r.status.padEnd(7)} ${mask(r.address)}${r.error ? `  — ${r.error.slice(0, 160)}` : ""}`);

  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (admin) {
    const u = await db.user.findUnique({ where: { email: admin }, select: { role: true, isActive: true } });
    line(`\nадминистратор из .env (${mask(admin)}): ${u ? `в базе, роль ${u.role}${u.isActive ? "" : ", ОТКЛЮЧЁН"}` : "НЕТ в базе — письмо для сброса на этот адрес не уйдёт"}`);
  }

  if (to && ch) {
    line(`\n== Тестовое письмо на ${to}`);
    const r = await ADAPTERS.EMAIL!.send(ch.config, to, "Проверка почты сайта T.Rodionova. Если вы видите это письмо, отправка работает.", "Проверка почты сайта");
    line(r.ok ? "отправлено: проверьте входящие и «Спам»" : `НЕ отправлено: ${r.error}`);
    if (!r.ok && r.error) {
      const h = hintFor(r.error);
      if (h) line(`что сделать: ${h}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("Проверка не выполнилась:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
