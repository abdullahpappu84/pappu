import "server-only";

/**
 * Messaging adapters. Configure a provider via env to deliver real email/SMS:
 *  - EMAIL_WEBHOOK_URL (+ optional EMAIL_WEBHOOK_TOKEN): POST {to, subject, text} to your mail service (Resend/SES/Postmark relay).
 *  - SMS_WEBHOOK_URL (+ optional SMS_WEBHOOK_TOKEN): POST {to, text} to your SMS relay (Twilio/Vonage function).
 * Without a provider, messages are logged and (unless EXPOSE_DEV_TOKENS=false) the verification link/code is returned
 * to the browser so flows remain testable in preview environments.
 */
async function post(url: string, token: string | undefined, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Messaging provider responded ${res.status}`);
}

export const devTokensExposed = () => process.env.EXPOSE_DEV_TOKENS !== "false";

export async function sendEmail(to: string, subject: string, text: string): Promise<{ delivered: boolean }> {
  if (process.env.EMAIL_WEBHOOK_URL) {
    try {
      await post(process.env.EMAIL_WEBHOOK_URL, process.env.EMAIL_WEBHOOK_TOKEN, { to, subject, text });
      return { delivered: true };
    } catch (e) {
      console.error("[mail] delivery failed", e);
    }
  }
  console.info(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
  return { delivered: false };
}

export async function sendSms(to: string, text: string): Promise<{ delivered: boolean }> {
  if (process.env.SMS_WEBHOOK_URL) {
    try {
      await post(process.env.SMS_WEBHOOK_URL, process.env.SMS_WEBHOOK_TOKEN, { to, text });
      return { delivered: true };
    } catch (e) {
      console.error("[sms] delivery failed", e);
    }
  }
  console.info(`[sms:dev] to=${to} ${text}`);
  return { delivered: false };
}

export function appUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
