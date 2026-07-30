export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { businessName, industry, city } = req.body || {};
  if (!businessName || !industry || !city) {
    return res.status(400).json({ error: "Missing businessName, industry, or city" });
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
    console.log("ANTHROPIC_STATUS", response.status);
    console.log("ANTHROPIC_BODY", JSON.stringify(data).slice(0, 4000));
    console.log("KEY_PRESENT", !!process.env.ANTHROPIC_API_KEY, (process.env.ANTHROPIC_API_KEY || "").slice(0, 8));
    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = textBlocks.match(/RESULT_JSON:\s*(\{[\s\S]*\})/);
    if (!match) {
      return res.status(200).json({ parsed: null, raw: textBlocks, debug: data });
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
