import { getIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/** Файл ключа IndexNow: /indexnow/<ключ>.txt отдаёт сам ключ, любой другой адрес — 404. */
export async function GET(_req: Request, ctx: RouteContext<"/indexnow/[file]">) {
  const { file } = await ctx.params;
  const key = await getIndexNowKey();
  if (!key || file !== `${key}.txt`) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
