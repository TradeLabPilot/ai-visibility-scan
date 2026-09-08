// Forwards a post-result email capture into GoHighLevel.
//
// The scan itself no longer requires an email - it is asked for on the result
// screen instead, after the person has seen the finding. Fewer leads, but they
// are people who saw the result and still wanted the report.

import { promises as dnsPromises } from "dns";

const BLOCKED_EMAIL_DOMAINS = new Set([
  "test.com", "test.net", "test.org", "example.com", "example.net", "example.org",
  "fake.com", "fakemail.com", "nomail.com", "none.com", "asdf.com",
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "tempmail.com", "temp-mail.org", "throwawaymail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "spam4.me", "mailnesia.com", "tempinbox.com", "emailondeck.com",
  "moakt.com", "mohmal.com", "inboxbear.com", "discard.email", "tmpmail.org",
]);

async function validateEmail(email) {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) {
    return { ok: false, reason: "That does not look like a valid email address." };
  }
  const domain = email.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, reason: "That does not look like a valid email address." };
  }
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, reason: "Please use a real email address so we can send the report." };
  }
  try {
    const mx = await dnsPromises.resolveMx(domain);
    if (!mx || mx.length === 0) {
      return { ok: false, reason: "We could not find a mail server for that domain. Check the spelling?" };
    }
  } catch (err) {
    return { ok: false, reason: "We could not find a mail server for that domain. Check the spelling?" };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
  const email = clean(req.body?.email);
  const businessName = clean(req.body?.businessName);
  const industry = clean(req.body?.industry);
  const city = clean(req.body?.city);

  if (!email) {
    return res.status(400).json({ error: "Enter an email address." });
  }

  const check = await validateEmail(email);
  if (!check.ok) {
    return res.status(400).json({ error: check.reason });
  }

  if (!process.env.GHL_WEBHOOK_URL) {
    return res.status(200).json({ ok: true, forwarded: false });
  }

  try {
    await fetch(process.env.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        businessName,
        industry,
        city,
        cited: req.body?.cited,
        // Readable version - cited is a raw boolean and maps badly to GHL text fields
        namedYou: req.body?.cited === true ? "YES" : "NO",
        competitors: Array.isArray(req.body?.competitors)
          ? req.body.competitors.join(", ")
          : "",
        // Keep source EXACTLY as the original scan sent it so any existing GHL
        // filter still matches. Use "step" to tell the capture points apart.
        source: "AI Visibility Scan",
        step: "result screen",
        submittedAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Never block the visitor on a webhook problem - log it and move on.
    console.error("GHL webhook forward failed:", err.message);
    return res.status(200).json({ ok: true, forwarded: false });
  }

  return res.status(200).json({ ok: true, forwarded: true });
}
