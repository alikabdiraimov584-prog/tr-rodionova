import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // юридические документы читаются с диска на сервере
  outputFileTracingIncludes: { "/offer": ["./docs/legal/**"], "/privacy": ["./docs/legal/**"] },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
