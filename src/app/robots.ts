import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/crm", "/account", "/checkout", "/cart", "/api/", "/login", "/register", "/unsubscribe/", "/go/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
