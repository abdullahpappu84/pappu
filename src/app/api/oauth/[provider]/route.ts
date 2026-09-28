import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUserSession } from "@/lib/server/auth";
import { randomToken, safeEqual } from "@/lib/server/crypto";
import { appUrl } from "@/lib/server/mailer";
import { createUserAccount } from "@/lib/server/users";

export const dynamic = "force-dynamic";

/**
 * Optional social login (OAuth 2.0 authorization-code flow).
 * Enable by setting GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and/or FACEBOOK_CLIENT_ID/FACEBOOK_CLIENT_SECRET.
 * Redirect URI to register with the provider: {APP_URL}/api/oauth/google (or /facebook).
 */
const PROVIDERS = {
  google: {
    id: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    async profile(accessToken: string) {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      const p = (await r.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      return { id: p.sub, email: p.email, verified: !!p.email_verified, name: p.name, avatar: p.picture };
    },
  },
  facebook: {
    id: () => process.env.FACEBOOK_CLIENT_ID,
    secret: () => process.env.FACEBOOK_CLIENT_SECRET,
    authorize: "https://www.facebook.com/v19.0/dialog/oauth",
    token: "https://graph.facebook.com/v19.0/oauth/access_token",
    scope: "email,public_profile",
    async profile(accessToken: string) {
      const r = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`);
      const p = (await r.json()) as { id: string; email?: string; name?: string; picture?: { data?: { url?: string } } };
      return { id: p.id, email: p.email, verified: !!p.email, name: p.name, avatar: p.picture?.data?.url };
    },
  },
} as const;

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = appUrl(req);
  const cfg = PROVIDERS[provider as keyof typeof PROVIDERS];
  const fail = (msg: string) => NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(msg)}`);
  if (!cfg || !cfg.id() || !cfg.secret()) return fail(`${provider} login is not configured.`);
  const url = new URL(req.url);
  const redirectUri = `${base}/api/oauth/${provider}`;
  const store = await cookies();

  const code = url.searchParams.get("code");
  if (!code) {
    const state = randomToken(16);
    store.set("ar_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    const auth = new URL(cfg.authorize);
    auth.search = new URLSearchParams({ client_id: cfg.id()!, redirect_uri: redirectUri, response_type: "code", scope: cfg.scope, state }).toString();
    return NextResponse.redirect(auth.toString());
  }

  const expected = store.get("ar_oauth_state")?.value;
  store.delete("ar_oauth_state");
  if (!expected || !safeEqual(expected, url.searchParams.get("state") ?? "")) return fail("Login session expired, please try again.");

  try {
    const tokenRes = await fetch(cfg.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: cfg.id()!, client_secret: cfg.secret()!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return fail("Could not complete social login.");
    const p = await cfg.profile(tok.access_token);
    if (!p.email) return fail("Your social account did not share an email address.");
    const col = provider === "google" ? users.googleId : users.facebookId;
    let [u] = await db.select().from(users).where(eq(col, p.id));
    if (!u) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, p.email.toLowerCase()));
      if (byEmail) {
        if (!p.verified) return fail("Please log in with your password and link your account from your profile.");
        [u] = await db.update(users).set(provider === "google" ? { googleId: p.id } : { facebookId: p.id }).where(eq(users.id, byEmail.id)).returning();
      } else {
        u = await db.transaction((tx) =>
          createUserAccount(tx, {
            name: p.name ?? p.email!.split("@")[0],
            email: p.email!,
            avatarUrl: p.avatar,
            emailVerified: p.verified,
            ...(provider === "google" ? { googleId: p.id } : { facebookId: p.id }),
          }),
        );
      }
    }
    if (u.status === "banned") return fail("This account has been banned.");
    await createUserSession(u.id, req);
    return NextResponse.redirect(`${base}/`);
  } catch (e) {
    console.error("[oauth]", e);
    return fail("Social login failed.");
  }
}
