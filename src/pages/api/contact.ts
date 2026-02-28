import type { APIRoute } from "astro";
import {
  TURNSTILE_SECRET_KEY,
  RESEND_API_KEY,
  CONTACT_TO_EMAIL,
  CONTACT_FROM_EMAIL,
  CONTACT_SUBJECT_PREFIX,
} from "astro:env/server";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export const POST: APIRoute = async (context) => {
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
  const ip = context.clientAddress;
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
  const subject = `${CONTACT_SUBJECT_PREFIX ?? "[Contact]"} ${name}`;
  const text =
    `Name: ${name}\n` +
    `Email: ${email}\n\n` +
    `Message:\n${message}\n`;

  const toEmails = (CONTACT_TO_EMAIL as string)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: toEmails,
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
