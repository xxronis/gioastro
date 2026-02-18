import type { APIRoute } from "astro";

function getEnv(locals: any) {
  const runtimeEnv = locals?.runtime?.env ?? {};
  const buildEnv = import.meta.env ?? {};
  return { ...buildEnv, ...runtimeEnv } as Record<string, string | undefined>;
}

function isValidEmail(v: string) {
  // Simple sanity check (don’t overdo it)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export const POST: APIRoute = async (context) => {
  const env = getEnv(context.locals);

  const TURNSTILE_SECRET_KEY = env.TURNSTILE_SECRET_KEY;
  const RESEND_API_KEY = env.RESEND_API_KEY;

  const CONTACT_TO_EMAIL = env.CONTACT_TO_EMAIL;     // where you receive messages
  const CONTACT_FROM_EMAIL = env.CONTACT_FROM_EMAIL; // must be verified in Resend
  const CONTACT_SUBJECT_PREFIX = env.CONTACT_SUBJECT_PREFIX ?? "[Contact]";

  if (!TURNSTILE_SECRET_KEY) return Response.redirect(new URL("/contact?error=turnstile_secret", context.url), 303);
  if (!RESEND_API_KEY) return Response.redirect(new URL("/contact?error=resend_key", context.url), 303);
  if (!CONTACT_TO_EMAIL) return Response.redirect(new URL("/contact?error=to_missing", context.url), 303);
  if (!CONTACT_FROM_EMAIL) return Response.redirect(new URL("/contact?error=from_missing", context.url), 303);

  const form = await context.request.formData();

  // Honeypot
  const website = String(form.get("website") ?? "");
  if (website.trim().length > 0) {
    return Response.redirect(new URL("/contact?sent=1", context.url), 303);
  }

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();

  const token = String(form.get("cf-turnstile-response") ?? "").trim();

  if (!name || name.length < 2) return Response.redirect(new URL("/contact?error=name", context.url), 303);
  if (!isValidEmail(email)) return Response.redirect(new URL("/contact?error=email", context.url), 303);
  if (!message || message.length < 10) return Response.redirect(new URL("/contact?error=message", context.url), 303);
  if (!token) return Response.redirect(new URL("/contact?error=turnstile", context.url), 303);

  // Turnstile verify
  const ip = context.clientAddress; // ok if undefined; Turnstile accepts without it
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    }),
  });

  if (!verifyRes.ok) return Response.redirect(new URL("/contact?error=turnstile_verify", context.url), 303);
  const verifyJson = (await verifyRes.json()) as { success?: boolean };
  if (!verifyJson?.success) return Response.redirect(new URL("/contact?error=turnstile_fail", context.url), 303);

  // Send email via Resend
  const subject = `${CONTACT_SUBJECT_PREFIX} ${name}`;
  const text =
    `Name: ${name}\n` +
    `Email: ${email}\n\n` +
    `Message:\n${message}\n`;

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: [CONTACT_TO_EMAIL],
      subject,
      text,
      reply_to: email,
    }),
  });

  if (!sendRes.ok) {
    return Response.redirect(new URL("/contact?error=send", context.url), 303);
  }

  return Response.redirect(new URL("/contact?sent=1", context.url), 303);
};