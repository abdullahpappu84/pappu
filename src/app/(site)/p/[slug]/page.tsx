import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

async function getPage(slug: string) {
  const [p] = await db.select().from(pages).where(and(eq(pages.slug, slug), eq(pages.isPublished, true)));
  return p;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPage((await params).slug);
  return p ? { title: p.metaTitle || p.title, description: p.metaDescription ?? undefined } : {};
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPage((await params).slug);
  if (!p) notFound();
  return (
    <main className="container-x py-8 lg:py-12">
      <article className="panel mx-auto max-w-3xl rounded-2xl p-6 md:p-10">
        <div
          className="space-y-4 text-[14.5px] leading-relaxed text-white/75 [&_a]:text-gold-300 [&_a]:underline [&_h1]:font-display [&_h1]:text-[34px] [&_h1]:font-bold [&_h1]:uppercase [&_h1]:text-white [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:text-gold-200 [&_h3]:font-semibold [&_h3]:text-white [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(p.content) }}
        />
        <p className="mt-8 border-t border-white/[0.06] pt-4 text-[12px] text-white/40">Last updated {p.updatedAt.toLocaleDateString("en-GB")}</p>
      </article>
    </main>
  );
}
