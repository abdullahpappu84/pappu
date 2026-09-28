import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { deposits, kycSubmissions } from "@/db/schema";
import { can, getAdminContext, getCurrentUser } from "@/lib/server/auth";
import { readUpload } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/** Serves uploads. Private files (KYC documents, payment proofs) require the owner or an authorised admin. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = await readUpload(path);
  if (!file) return new Response("Not found", { status: 404 });
  if (file.visibility === "private") {
    const url = `/api/files/${path.join("/")}`;
    const admin = await getAdminContext();
    let allowed = false;
    if (admin) allowed = (file.folder === "kyc" && can(admin, "kyc.view")) || (file.folder === "proofs" && can(admin, "finance.view"));
    if (!allowed) {
      const cur = await getCurrentUser();
      if (cur) {
        if (file.folder === "kyc") {
          const [k] = await db.select({ id: kycSubmissions.id }).from(kycSubmissions).where(and(eq(kycSubmissions.userId, cur.user.id), or(eq(kycSubmissions.frontUrl, url), eq(kycSubmissions.backUrl, url), eq(kycSubmissions.selfieUrl, url))));
          allowed = !!k;
        } else if (file.folder === "proofs") {
          const [d] = await db.select({ id: deposits.id }).from(deposits).where(and(eq(deposits.userId, cur.user.id), eq(deposits.proofUrl, url)));
          allowed = !!d;
        }
      }
    }
    if (!allowed) return new Response("Forbidden", { status: 403 });
  }
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": file.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
