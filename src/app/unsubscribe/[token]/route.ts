import { db } from "@/lib/db";

function page(title: string, text: string, form?: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>T.Rodionova</title>
<style>body{font-family:Georgia,serif;background:#f8f5ee;color:#0e0e0e;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}p{font-family:system-ui,sans-serif;font-weight:300;color:#6f675e}a{color:#0e0e0e}button{font:inherit;font-family:system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:12px;padding:12px 28px;background:#0e0e0e;color:#f8f5ee;border:0;cursor:pointer}</style></head>
<body><div><h1>${title}</h1><p>${text}</p>${form ?? ""}<p><a href="/">На сайт</a></p></div></body></html>`;
}

/** Ссылка из письма открывает подтверждение: почтовые сканеры, переходящие по ссылкам, не отпишут клиента сами. */
export async function GET(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const user = await db.user.findUnique({ where: { unsubscribeToken: token }, select: { id: true } });
  const html = user
    ? page("Отписаться от рассылок?", "Рекламные письма перестанут приходить. Сообщения о заказах продолжат приходить.", `<form method="post"><button type="submit">Отписаться</button></form>`)
    : page("Ссылка не найдена", "Возможно, ссылка устарела. Напишите на care@t-rodionova.ru.");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** Подтверждение формой или заголовком List-Unsubscribe-Post из почтового клиента. */
export async function POST(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const user = await db.user.findUnique({ where: { unsubscribeToken: token }, select: { id: true } });
  if (user) {
    await db.user.update({ where: { id: user.id }, data: { marketingConsent: false } });
    await db.consent.create({ data: { userId: user.id, type: "MARKETING", granted: false, version: "link" } });
  }
  const html = user ? page("Вы отписаны", "Рекламные письма больше не придут. Сообщения о заказах продолжат приходить.") : page("Ссылка не найдена", "Возможно, ссылка устарела. Напишите на care@t-rodionova.ru.");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
