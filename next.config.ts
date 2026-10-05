import type { NextConfig } from "next";

// Идентификатор сборки для защиты от «разъезда версий» при обновлении без простоя: клиент со старой
// вкладкой узнаёт о новой версии и перезагружает страницу вместо ошибки. На стенде не задаётся.
const deploymentId = process.env.GIT_SHA && process.env.GIT_SHA !== "unknown" ? process.env.GIT_SHA : undefined;

const nextConfig: NextConfig = {
  deploymentId,
  // Фото в карточку вещи грузятся через server action: по умолчанию Next принимает тело не больше 1 МБ,
  // а кадр со съёмки весит 2–10 МБ. Лимит действия — 12 МБ на файл, до пяти файлов за раз плюс служебные байты.
  // Второй порог — буфер тела запроса для proxy.ts (по умолчанию 10 МБ, иначе «Unexpected end of form»).
  experimental: { serverActions: { bodySizeLimit: "64mb" }, proxyClientMaxBodySize: "64mb" },
  // Фото отдаются через оптимизатор Next: под ширину экрана и в WebP, исходники любого размера (до 12 МБ из CRM)
  images: {
    // AVIF на ~30 % легче WebP при том же качестве; браузеры без AVIF получают WebP. Варианты кэшируются 31 день.
    formats: ["image/avif", "image/webp"],
    localPatterns: [{ pathname: "/images/**", search: "" }, { pathname: "/uploads/**", search: "" }],
    qualities: [75, 85],
    minimumCacheTTL: 2678400,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // юридические документы читаются с диска на сервере
  outputFileTracingIncludes: { "/offer": ["./docs/legal/**"], "/privacy": ["./docs/legal/**"] },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [{ source: "/(.*)", headers: security }];
  },
};

export default nextConfig;
