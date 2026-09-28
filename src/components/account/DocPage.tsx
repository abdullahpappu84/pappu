import { Download, FileText, Gamepad2, BookOpen, CreditCard, Plug } from "lucide-react";
import Link from "next/link";
import { renderMarkdown } from "@/lib/markdown";

const DOWNLOADS = [
  { href: "/downloads/aurum-royale-source.zip", label: "Full source (.zip)", icon: Download, primary: true },
  { href: "/downloads/INTEGRATION_GUIDE.md", label: "Any gateway / game API note (.md)", icon: Plug },
  { href: "/downloads/PAYMENT_GATEWAY_GUIDE.md", label: "Payment gateway note (.md)", icon: CreditCard },
  { href: "/downloads/GAME_API_GUIDE.md", label: "Game API note (.md)", icon: Gamepad2 },
  { href: "/downloads/INSTALL.md", label: "Install guide (.md)", icon: FileText },
];

/** Shared documentation layout for /install and /install/game-api (same design tokens as the site). */
export function DocPage({ title, subtitle, markdown, active }: { title: string; subtitle: string; markdown: string; active: "install" | "game" | "payments" | "integrations"| "game" }) {
  return (
    <main className="container-x py-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="panel rounded-2xl p-5">
          <p className="font-display text-[26px] font-semibold text-white">{title}</p>
          <p className="text-[13px] text-white/55">{subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {DOWNLOADS.map(({ href, label, icon: Icon, primary }) => (
              <a key={href} href={href} download className={primary ? "inline-flex h-11 items-center gap-2 rounded-full bg-gold-gradient px-6 text-[13px] font-bold uppercase tracking-wide text-ink-950 shadow-gold" : "inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-[13px] text-white hover:border-gold-300/60"}>
                <Icon className="h-4 w-4" /> {label}
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
            <Link href="/install" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] ${active === "install" ? "bg-gold-400/15 text-gold-200" : "text-white/60 hover:bg-white/5"}`}><BookOpen className="h-3.5 w-3.5" /> Installation guide</Link>
            <Link href="/install/integrations" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] ${active === "integrations" ? "bg-gold-400/15 text-gold-200" : "text-white/60 hover:bg-white/5"}`}><Plug className="h-3.5 w-3.5" /> Any gateway / game API</Link>
            <Link href="/install/payments" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] ${active === "payments" ? "bg-gold-400/15 text-gold-200" : "text-white/60 hover:bg-white/5"}`}><CreditCard className="h-3.5 w-3.5" /> Payment gateway</Link>
            <Link href="/install/game-api" className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] ${active === "game" ? "bg-gold-400/15 text-gold-200" : "text-white/60 hover:bg-white/5"}`}><Gamepad2 className="h-3.5 w-3.5" /> Game API note</Link>
          </div>
        </div>
        <article
          className="panel space-y-4 rounded-2xl p-6 text-[14px] leading-relaxed text-white/75 md:p-10 [&_a]:text-gold-300 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-gold-100 [&_h1]:font-display [&_h1]:text-[32px] [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-white/[0.06] [&_h2]:pt-6 [&_h2]:font-display [&_h2]:text-[23px] [&_h2]:font-semibold [&_h2]:text-gold-200 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-white [&_li]:ml-5 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-ink-950/80 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12.5px] [&_pre_code]:leading-relaxed [&_strong]:text-white"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
        />
      </div>
    </main>
  );
}
