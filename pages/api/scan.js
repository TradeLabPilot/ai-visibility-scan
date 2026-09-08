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

// Crude per-IP throttle. Resets on cold start and is not shared across serverless
// instances, so it will not stop a determined attacker - but it stops an accidental
// loop or casual abuse, which is what actually runs up the bill on a public endpoint
// that costs money per call.
//
// EVENT DAY: everyone on shared venue wifi looks like ONE ip. Raise MAX_PER_WINDOW
// to 40 before a live demo, then put it back.
const RATE = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 8;

function rateLimited(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RATE.set(ip, hits);
  if (RATE.size > 5000) RATE.clear();
  return hits.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (rateLimited(req)) {
    return res.status(429).json({
      error: "That is a lot of scans from one place. Try again in a little while.",
    });
  }

  // Normalize inputs before they reach the prompt. Without this, "McDonalds",
  // "McDonald's" and "  MCDONALDS " build three different search queries and
  // can return three different verdicts for the same business.
  const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
  const businessName = clean(req.body?.businessName);
  const industry = clean(req.body?.industry).toLowerCase();
  const city = clean(req.body?.city);
  const email = clean(req.body?.email);
  if (!businessName || !industry || !city) {
    return res.status(400).json({ error: "Missing businessName, industry, or city" });
  }

  // Reject unusable email addresses before anything else happens.
  if (email) {
    const emailCheck = await validateEmail(email);
    if (!emailCheck.ok) {
      return res.status(400).json({ error: emailCheck.reason });
    }
  }

  // Fire the lead into GHL immediately — don't wait on the scan to finish,
  // and don't let a webhook failure break the scan itself.
  if (email && process.env.GHL_WEBHOOK_URL) {
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

  const prompt = `You are a general-purpose AI assistant with live web access, answering a real person who is about to spend money.

STEP 1 - Research the category. Run exactly TWO searches, no more:
  "best ${industry} in ${city}"
  "${industry} ${city} reviews"
Do NOT build your answer on a single ranked list from one site. Corroborate across at least two INDEPENDENT sources before naming anyone. If one aggregator dominates both queries, treat that as a finding to report, not as your only evidence. Be efficient - you have a hard limit of 3 searches for this entire task.

STEP 2 - Now answer the question the way you normally would: "Who is the best ${industry} in ${city}? Give me three specific businesses I could call." Name real businesses you actually found. Do not name a business you found no evidence for.

STEP 3 - Now run ONE search for the business itself: "${businessName} ${city}". Find out what exists for it - website, profiles, reviews, listings, mentions. This step is about THIS business, not the category. One search only.

STEP 4 - Report:
- Did your own STEP 2 answer name "${businessName}"? Match LOOSELY: ignore capitalisation, punctuation, apostrophes, and suffixes like Inc, LLC or Co. Treat "McDonalds", "McDonald's" and "MCDONALDS" as the same business. A different trading name still counts.
- Which businesses did you name instead?
- Up to 3 gaps for this business, based on what STEP 3 actually found. THE THREE GAPS MUST BE MATERIALLY DIFFERENT FROM EACH OTHER - do not restate one absence three ways. Draw on different dimensions where the evidence supports it: what exists but is thin or inconsistent, what is missing entirely, what the named businesses demonstrate that this one does not. Say what the business DOES have before saying what it lacks. Only list a gap you actually saw evidence for. If STEP 3 found too little to judge, say exactly that instead of guessing.

Set "cited" to true ONLY if your own STEP 2 answer named the business. If your searches returned too little to answer properly, set confidence to "low".

Keep your written summary to AT MOST 2 sentences. Plain text only - no markdown, no bold, no headings, no bullet points.

The summary and the note are read by a business owner, not by you. NEVER refer to your own process: do not write "Step 1", "Step 2", "my search", "I searched" or anything describing how you worked. Report the finding, not the procedure. Write "AI recommends X, Y and Z" - never "My Step 2 named X, Y and Z".

The RESULT_JSON line is required and must always be the last thing you output.

Write the short summary, then on its own line write exactly:
RESULT_JSON: {"cited": true or false, "confidence": "high" or "medium" or "low", "competitors": ["name1","name2","name3"], "note": "one or two sentences: who you named, and what you relied on to decide", "gaps": ["specific checkable gap 1","a materially different gap 2","a materially different gap 3"]}`;

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
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      }),
    });

    const data = await response.json();
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    let match = textBlocks.match(/RESULT_JSON:\s*(\{[\s\S]*\})/);
    // Fallback: the model sometimes omits the marker but still emits the object.
    if (!match) match = textBlocks.match(/(\{[\s\S]*?"cited"[\s\S]*?\})/);
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
