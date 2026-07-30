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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { businessName, industry, city, email } = req.body || {};
  if (!businessName || !industry || !city || !email) {
    return res.status(400).json({ error: "Missing businessName, industry, city, or email" });
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
1. Search for "best ${industry} in ${city}" and close variations.
2. Check whether "${businessName}" appears in results, directories, or ranking/review pages that AI tools commonly cite.
3. Note up to 3 competitor business names that appear prominently instead.

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
