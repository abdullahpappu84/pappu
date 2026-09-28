import { verifyTicket } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Auto-submitting form for "form_post" gateways (signed, 30-minute ticket created at deposit time). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const data = verifyTicket<{ k: string; u: string; m: string; f: Record<string, string> }>(t);
  if (!data || data.k !== "payform" || !/^https?:\/\//.test(data.u)) return new Response("This payment link has expired. Please start a new deposit.", { status: 410 });
  const inputs = Object.entries(data.f).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Redirecting to payment…</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#05060a;color:#e8eaf1;font-family:system-ui,sans-serif}.s{width:36px;height:36px;border:3px solid rgba(240,185,63,.25);border-top-color:#f0b93f;border-radius:50%;animation:r 1s linear infinite;margin:0 auto 16px}@keyframes r{to{transform:rotate(360deg)}}button{margin-top:14px;background:linear-gradient(#ffe28f,#dc9d22);border:0;border-radius:999px;padding:10px 22px;font-weight:700;cursor:pointer}</style></head>
<body><form id="f" method="${data.m === "GET" ? "GET" : "POST"}" action="${esc(data.u)}"><div style="text-align:center"><div class="s"></div><p>Redirecting to secure payment…</p>${inputs}<noscript><button type="submit">Continue</button></noscript></div></form>
<script>document.getElementById("f").submit()</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
