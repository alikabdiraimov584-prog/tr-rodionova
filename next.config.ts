import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фото отдаются через оптимизатор Next: под ширину экрана и в WebP, исходники любого размера (до 12 МБ из CRM)
  images: {
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
