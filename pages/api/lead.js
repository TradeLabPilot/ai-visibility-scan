// Forwards captured contact info (name, phone, email, plus scan context)
// into GHL via the same Inbound Webhook used by /api/scan. Called from the
// fix-plan page's native contact form, right before showing the calendar.
//
// Requires GHL_WEBHOOK_URL as an environment variable (same one set up for
// the scan's email capture).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, email, businessName, industry, city, cited, competitors } = req.body || {};
  if (!name || !phone || !email) {
    return res.status(400).json({ error: "Missing name, phone, or email" });
  }

  if (!process.env.GHL_WEBHOOK_URL) {
    return res.status(500).json({ error: "GHL_WEBHOOK_URL is not configured" });
  }

  try {
    await fetch(process.env.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        email,
        businessName,
        industry,
        city,
        cited,
        competitors,
        source: "AI Visibility Scan — Fix Plan",
        submittedAt: new Date().toISOString(),
      }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
