// Проверка разбора входящих писем для inbox: node --conditions=react-server --import tsx scripts/tests/mail-parse.test.ts
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { stripQuotedReply } from "../../src/lib/support/channels";
import { inboundFromMail, isAutomatedMail } from "../../src/lib/support/mail-imap";

const raw = (headers: string, body: string) => Buffer.from(`${headers.trim()}\r\n\r\n${body}`);

async function main() {
  // 1. цитата после «написал(а):» отрезается, подпись после «--» тоже
  assert.equal(stripQuotedReply("Добрый день! Подошёл размер S.\n\nсб, 4 окт. 2026 г. в 12:10, T.Rodionova <care@tr-rodionova.ru> написал(а):\n> Анна, здравствуйте.\n> Мы приняли ваш заказ"), "Добрый день! Подошёл размер S.");
  assert.equal(stripQuotedReply("Спасибо, всё получила\n\n-- \nАнна\n+7 900"), "Спасибо, всё получила");
  assert.equal(stripQuotedReply("Вопрос по возврату\n\nOn Mon, Oct 5, 2026 at 10:00 AM T.Rodionova wrote:\n> текст"), "Вопрос по возврату");
  assert.equal(stripQuotedReply("Хочу вернуть жакет\n-----Original Message-----\nFrom: care\nSent: x"), "Хочу вернуть жакет");
  assert.equal(stripQuotedReply("Только цитата\n> а\n> б").length > 0, true);

  // 2. обычное письмо клиентки с SPF/DKIM pass → обращение с подтверждённым отправителем
  const m1 = await simpleParser(raw(`From: Анна Иванова <anna@example.com>
To: care@tr-rodionova.ru
Subject: Re: Заказ №118 принят
Message-ID: <abc123@example.com>
Authentication-Results: mx.yandex.ru; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com
Content-Type: text/plain; charset=utf-8`, "Здравствуйте! Можно заменить размер на M?\n\n> Анна, здравствуйте.\n> Мы приняли ваш заказ №118."));
  assert.equal(isAutomatedMail(m1, ["care@tr-rodionova.ru"]), false);
  const in1 = inboundFromMail(m1)!;
  assert.equal(in1.contactExternalId, "anna@example.com");
  assert.equal(in1.text, "Здравствуйте! Можно заменить размер на M?");
  assert.equal(in1.subject, "Re: Заказ №118 принят");
  assert.equal(in1.messageExternalId, "mail_abc123@example.com");
  assert.equal(in1.identityVerified, true);
  assert.equal(in1.name, "Анна Иванова");

  // 3. без SPF/DKIM — отправитель не подтверждён
  const m2 = await simpleParser(raw(`From: someone@example.org\nTo: care@tr-rodionova.ru\nSubject: hi\nContent-Type: text/plain`, "Текст"));
  assert.equal(inboundFromMail(m2)!.identityVerified, false);

  // 4. автоответы, недоставка, свои письма и рассылки пропускаются
  const auto = await simpleParser(raw(`From: anna@example.com\nAuto-Submitted: auto-replied\nSubject: Автоответ`, "Я в отпуске"));
  assert.equal(isAutomatedMail(auto, []), true);
  const bounce = await simpleParser(raw(`From: MAILER-DAEMON@mx.yandex.ru\nSubject: Undelivered Mail`, "bounce"));
  assert.equal(isAutomatedMail(bounce, []), true);
  const own = await simpleParser(raw(`From: care@tr-rodionova.ru\nSubject: Re: заказ`, "наш ответ"));
  assert.equal(isAutomatedMail(own, ["care@tr-rodionova.ru"]), true);
  const list = await simpleParser(raw(`From: news@shop.example\nList-Id: <news.shop.example>\nPrecedence: bulk\nSubject: Акция`, "скидки"));
  assert.equal(isAutomatedMail(list, []), true);

  // 5. HTML-письмо без текстовой части → текст из HTML
  const html = await simpleParser(raw(`From: b@example.com\nSubject: html\nContent-Type: text/html; charset=utf-8`, "<html><body><p>Добрый день,</p><p>когда будет доставка?</p></body></html>"));
  assert.equal(inboundFromMail(html)!.text.replace(/\s+/g, " "), "Добрый день, когда будет доставка?");
  console.log("mail-parse: 20 проверок PASS");
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
