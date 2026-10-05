import { llmsText } from "@/lib/llms";

export const dynamic = "force-dynamic";

/** llms-full.txt — полные тексты сайта одним файлом для ИИ-систем. */
export async function GET() {
  const text = await llmsText(true);
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
