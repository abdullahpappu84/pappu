import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getSettings();
  const h = await headers();
  const base = (s.seo.canonicalUrl || process.env.APP_URL || `https://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`).replace(/\/$/, "");
  let list: { slug: string; updatedAt: Date }[] = [];
  try {
    list = await db.select({ slug: pages.slug, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.isPublished, true));
  } catch {
    /* db unavailable */
  }
  return [{ url: `${base}/`, changeFrequency: "daily", priority: 1 }, ...list.map((p) => ({ url: `${base}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 }))];
}
