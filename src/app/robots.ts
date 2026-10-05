import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// адрес сайта берётся из APP_URL на запрос, а не при сборке (при сборке в Docker его нет)
export const dynamic = "force-dynamic";

const PRIVATE = ["/crm", "/account", "/checkout", "/cart", "/api/", "/login", "/register", "/unsubscribe/", "/go/"];

/**
 * ИИ-краулеры и ответные системы: по RFC 9309 бот применяет только самую специфичную группу, поэтому для каждого
 * известного агента правила повторяются явно — так ни один из них не выпадет из-за будущих изменений группы «*».
 * Политика бренда — максимальная видимость: разрешены и поисковые агенты (ответы со ссылкой), и обучающие.
 * YandexAdditional / YandexAdditionalBot — единственный способ Яндекса разрешить или запретить контент в Алисе AI (Нейро).
 */
const AI_AGENTS = [
  "YandexBot", "YandexAdditional", "YandexAdditionalBot",
  "Googlebot", "Google-Extended", "Bingbot",
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "Applebot", "Applebot-Extended",
  "Amazonbot", "Amzn-SearchBot",
  "Meta-ExternalAgent", "Meta-ExternalFetcher",
  "DuckAssistBot", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_AGENTS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
