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

  const prompt = `You are an AI assistant with live web access. Be fast and brief. HARD LIMIT: 2 searches total.

Search 1: "best ${industry} in ${city}" - from the results, name the three businesses most likely to be recommended.
Search 2: search ONLY the business name in quotes, with NO city and no other words: "${businessName}"
Do not add the city to this search. Adding a city pulls in Zillow, Redfin and Realtor pages that bury the business itself. The city is already covered by search 1. From these results, find the official website, profiles, reviews and listings, and note any OTHER name the business also trades under - a team name, DBA, owner name or brokerage.

"named" must be exactly the three businesses you would actually recommend, in order, whether or not "${businessName}" is among them. Do not leave it out to be polite and do not add it to be kind. Report honestly - the verdict is computed from this list, not from your opinion.

OUTPUT RULES - a busy business owner reads this on a phone:
- Never mention your process, steps or searches. Report the finding only. Write "AI recommends X, Y and Z", never "my search found" or "Step 2 named".
- note: ONE sentence, 20 words maximum.
- gaps: SHORT PHRASES, 8 words maximum each. Not sentences. Examples: "No Yelp or Zillow profile", "No website - Facebook page only", "Zero third-party reviews found".
- Only state what you actually saw. If search 2 found too little, return fewer gaps and set confidence low.
- NEVER claim a business has no website, no profile or no reviews. You cannot know that from a search - you only know what did not surface. Always phrase absence as a visibility finding, not an existence claim.
  Write "Website not surfacing for your own name" - never "No official website found".
  Write "No Yelp profile surfacing" - never "No Yelp profile".
- If the business appears under several different names, say so - that is one of the most useful gaps you can report. Example: "Listed under 3 different names".
  This matters: the business owner reading it knows what they have, and a wrong claim ends the conversation.
- Plain text only. No markdown, bold, headings or bullets.

Output the one-sentence finding, then on its own line exactly:
RESULT_JSON: {"named": ["name1","name2","name3"], "confidence": "high" or "medium" or "low", "note": "one sentence, 20 words max", "gaps": ["8 words max","8 words max","8 words max"]}`;

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
        max_tokens: 900,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
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

    // The verdict is computed here, not taken from the model. Asking a model to
    // both produce a list and judge its own list against a name produced false
    // positives - "AI named you" while the business was absent from its own three.
    const norm = (v) =>
      String(v || "")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\b(inc|llc|llp|ltd|co|corp|company|the|group|team|realty|real estate)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const target = norm(businessName);
    const named = Array.isArray(parsed.named) ? parsed.named : [];
    // Containment only on whole words, and only for strings long enough to be
    // meaningful - otherwise a competitor called "A" matches every business.
    // norm() leaves only letters, digits and spaces, so there is nothing to escape.
    const contains = (hay, needle) => {
      if (needle.length < 5) return false;
      return new RegExp("(^| )" + needle + "( |$)").test(hay);
    };

    const isMatch = (candidate) => {
      const c = norm(candidate);
      if (!c || !target) return false;
      return c === target || contains(c, target) || contains(target, c);
    };

    parsed.cited = named.some(isMatch);
    parsed.competitors = named.filter((n) => !isMatch(n));

    return res.status(200).json({ parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
