// Deploy this as /api/scan.js if using Vercel (zero-config serverless function).
// Set ANTHROPIC_API_KEY as an environment variable in your hosting provider's
// dashboard — never hardcode it here or ship it to the browser.
//
// OPTIONAL LEAD CAPTURE: set GHL_WEBHOOK_URL as an environment variable to
// forward the lead into GoHighLevel the moment someone submits the form —
// before the scan even runs, so the lead is saved even if they close the
// tab before seeing results.
//
// To get a webhook URL: in GHL, create a Workflow with an "Inbound Webhook"
// trigger. GHL gives you a unique POST URL — paste that in as GHL_WEBHOOK_URL.
// No API key needed for this method, just that URL.

import { promises as dnsPromises } from "dns";

// Reject addresses that can never receive mail: known throwaway/test domains,
// and any domain with no MX record (catches invented domains and typos like
// "gmial.com"). This runs BEFORE the GHL webhook so junk never enters the CRM.
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
    return { ok: false, reason: "Please use a real email address so we can send you the results." };
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

  // Normalize inputs before they reach the prompt. Without this, "McDonalds",
  // "McDonald's" and "  MCDONALDS " build three different search queries and
  // can return three different verdicts for the same business.
  const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
  const businessName = clean(req.body?.businessName);
  const industry = clean(req.body?.industry).toLowerCase();
  const city = clean(req.body?.city);
  const email = clean(req.body?.email);
  if (!businessName || !industry || !city || !email) {
    return res.status(400).json({ error: "Missing businessName, industry, city, or email" });
  }

  // Reject unusable email addresses before anything else happens.
  const emailCheck = await validateEmail(email);
  if (!emailCheck.ok) {
    return res.status(400).json({ error: emailCheck.reason });
  }

  // Fire the lead into GHL immediately — don't wait on the scan to finish,
  // and don't let a webhook failure break the scan itself.
  if (process.env.GHL_WEBHOOK_URL) {
    try {
      await fetch(process.env.GHL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          industry,
          city,
          email,
          source: "AI Visibility Scan",
          submittedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error("GHL webhook forward failed:", err.message);
    }
  }

  const prompt = `You are an AI visibility auditor. Search the web to determine whether the business "${businessName}" (industry: ${industry}, location: ${city}) would likely be named if someone asked an AI assistant like ChatGPT or Perplexity "who is the best ${industry} in ${city}" or "who should I call for ${industry} near ${city}".

Do this:
1. Search for "best ${industry} in ${city}" and close variations. Run the search both with and without any state or region suffix in the location.
2. Check whether the business appears in results, directories, or ranking/review pages that AI tools commonly cite. Match the business name LOOSELY: ignore capitalisation, punctuation, apostrophes, and suffixes like Inc, LLC or Co. Treat "McDonalds", "McDonald's" and "MCDONALDS" as the same business. A listing under a slightly different trading name still counts as appearing.
3. Note up to 3 competitor business names that appear prominently instead.

Base "cited" only on what the searches actually returned. If they returned too little to judge, set confidence to "low" rather than defaulting to false.

Respond with a short 2-sentence plain-English summary, then on its own line write exactly:
RESULT_JSON: {"cited": true or false, "confidence": "high" or "medium" or "low", "competitors": ["name1","name2","name3"], "note": "one short diagnostic sentence"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    const data = await response.json();
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = textBlocks.match(/RESULT_JSON:\s*(\{[\s\S]*\})/);
    if (!match) {
      return res.status(200).json({ parsed: null, raw: textBlocks });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch (_) {
      return res.status(200).json({ parsed: null, raw: textBlocks });
    }

    return res.status(200).json({ parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
