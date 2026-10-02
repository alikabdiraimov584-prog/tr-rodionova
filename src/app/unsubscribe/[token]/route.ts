import { db } from "@/lib/db";

/** Отписка от рассылок по ссылке из письма: без входа, одним переходом. */
export async function GET(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const user = await db.user.findUnique({ where: { unsubscribeToken: token } });
  if (user) {
    await db.user.update({ where: { id: user.id }, data: { marketingConsent: false } });
    await db.consent.create({ data: { userId: user.id, type: "MARKETING", granted: false, version: "link" } });
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T.Rodionova</title>
<style>body{font-family:Georgia,serif;background:#f8f5ee;color:#0e0e0e;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}p{font-family:system-ui,sans-serif;font-weight:300;color:#6f675e}a{color:#0e0e0e}</style></head>
<body><div><h1>${user ? "Вы отписаны" : "Ссылка не найдена"}</h1><p>${user ? "Рекламные письма больше не придут. Сообщения о заказах продолжат приходить." : "Возможно, ссылка устарела. Напишите на care@t-rodionova.ru."}</p><p><a href="/">На сайт</a></p></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
