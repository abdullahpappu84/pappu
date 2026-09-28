import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const s = await getSettings();
  const h = await headers();
  const base = (s.seo.canonicalUrl || process.env.APP_URL || `https://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`).replace(/\/$/, "");
  const disallow = s.seo.robotsDisallow.split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    rules: s.seo.robotsIndex ? { userAgent: "*", allow: "/", disallow } : { userAgent: "*", disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
