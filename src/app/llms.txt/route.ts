import { llmsText } from "@/lib/llms";

export const dynamic = "force-dynamic";

/** llms.txt — краткое описание сайта для ИИ-систем (llmstxt.org). */
export async function GET() {
  const text = await llmsText(false);
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
