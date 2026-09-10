import type { TicketMailRequest } from "./ticketMessage";

export type MailResult = { status: "sent"; providerMessageId: string } | { status: "failed" | "unknown"; code: string };

export function ticketMailConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.SUPPORT_MAIL_ENABLED !== "true" || env.SUPPORT_MAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY || !env.SUPPORT_MAIL_FROM || !env.HUB_PUBLIC_URL) return null;
  return { apiKey: env.RESEND_API_KEY, from: env.SUPPORT_MAIL_FROM, origin: env.HUB_PUBLIC_URL };
}

export async function sendTicketMail(request: TicketMailRequest, idempotencyKey: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<MailResult> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      // Never persist provider bodies: they may echo addresses, content or credentials.
      await response.body?.cancel();
      return { status: response.status >= 500 || response.status === 409 ? "unknown" : "failed", code: `provider_http_${response.status}` };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id)) {
      return { status: "unknown", code: "provider_invalid_response" };
    }
    return { status: "sent", providerMessageId: body.id };
  } catch {
    return { status: "unknown", code: "provider_network_or_timeout" };
  }
}
