import { useState } from "react";
import { useRouter } from "next/router";
import { CheckCircle2, TrendingDown } from "lucide-react";

// ---- CONFIG: paste your GHL Calendar widget's embed src here once you ----
// ---- have it (Calendars > [pick one] > Embed Code > copy the iframe src) --
const CALENDAR_EMBED_URL = "https://get.agencyailab.com/widget/bookings/call-78935dfb-5a44-45c2-bd97-85a506ec63d5-7d4e9869-3464-4384-b6b2-e22431c231f0-9faed237-2c74-4608-9d09-40a949c48211";

const INCLUDED = [
  "Directory and listing sync — one accurate record across the sites AI reads",
  "Content and citation work aimed at the sources those answers get built from",
  "Missed-call text-back — every missed call gets an instant reply, day or night",
  "Monthly visibility report — the same scan re-run, so you can see movement",
];

export default function FixPlan() {
  const router = useRouter();
  const { business, industry, cited, competitors, email } = router.query;

  const businessName = business || "your business";
  const industryName = industry || "your industry";
  const wasCited = cited === "true";
  const competitorList = competitors ? String(competitors).split(",").filter(Boolean) : [];
  const topCompetitor = competitorList[0];

  const [contactPhase, setContactPhase] = useState("form"); // form | submitting | booking | error
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [errorMsg, setErrorMsg] = useState("");

  const card = { background: "#FFFFFF", border: "1px solid #D3DEE7", borderRadius: 16, padding: 24 };
  const label = { color: "#5A7186", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", display: "block", marginBottom: 4 };
  const input = { background: "#F4F7FA", border: "1px solid #D3DEE7", color: "#16232E", width: "100%", borderRadius: 8, padding: "10px 12px", outline: "none", boxSizing: "border-box", fontSize: 14 };

  const reasons = wasCited
    ? [
        "Showing up once isn't the same as being the default answer — competitors can still out-rank your one mention.",
        "Citation frequency compounds: the more consistently AI names you, the more often it keeps naming you.",
        "A single citation with no tracking means you won't know if it disappears next month.",
      ]
    : [
        topCompetitor
          ? `Right now, ${topCompetitor} is showing up where your customers are looking. You're not.`
          : "Right now, competitors are showing up where your customers are looking. You're not.",
        "If a call comes in while you're on a job, most callers don't leave a message — they call the next name on the list.",
        "Inconsistent directory listings actively work against you: they confuse both customers and the AI models reading them.",
      ];

  const submitContact = async (e) => {
    e.preventDefault();
    if (!contact.name.trim() || !contact.phone.trim()) return;
    setContactPhase("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          phone: contact.phone,
          email: email || "",
          businessName,
          industry: industryName,
          city: "",
          cited: wasCited,
          competitors: competitorList.join(","),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setContactPhase("booking");
      } else {
        setErrorMsg(data.error || "Something went wrong saving your info.");
        setContactPhase("error");
      }
    } catch (err) {
      setErrorMsg(err.message);
      setContactPhase("error");
    }
  };

  return (
    <div style={{ background: "#F4F7FA", minHeight: "100vh", color: "#16232E", fontFamily: "system-ui, sans-serif", padding: "48px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ color: "#6E8598", letterSpacing: "0.18em", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginBottom: 12 }}>
            Agency AI Lab — Fix Plan
          </div>
          <h1 style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 30, lineHeight: 1.25, marginBottom: 12 }}>
            {router.isReady && business ? (
              wasCited ? (
                <>{businessName} showed up — here's how to rank higher.</>
              ) : (
                <>{businessName} isn't showing up in the sources AI checks for {industryName}.</>
              )
            ) : (
              <>You're not in the sources AI checks. Here's the fix.</>
            )}
          </h1>
          <p style={{ color: "#5A7186", fontSize: 15 }}>
            {wasCited
              ? "Being named once isn't the same as being the name AI defaults to. Here's what closes that gap."
              : "Most businesses have never checked. Here's what we found, and what closes the gap."}
          </p>
        </div>

        {competitorList.length > 0 && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ color: "#5A7186", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginBottom: 8 }}>
              Named instead of you
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
              {competitorList.map((c, i) => (
                <div key={i}>[{i + 1}] {c}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 15, marginBottom: 14 }}>
            <TrendingDown size={18} color="#C0392B" />
            Why This Is Worth Fixing Now
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 14, color: "#16232E", lineHeight: 1.5, paddingLeft: 16, borderLeft: "2px solid #C0392B" }}>
                {r}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>What's included in your fix plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {INCLUDED.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <CheckCircle2 size={18} color="#0084CC" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 14, color: "#16232E" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#0084CC", color: "#FFFFFF", borderRadius: 12, padding: "14px 18px", textAlign: "center", fontSize: 14, fontWeight: 600, marginBottom: 32 }}>
          No obligation. If we're not a fit, we'll tell you on the call.
        </div>

        {/* CONTACT FORM -> STRAIGHT TO CALENDAR */}
        {contactPhase === "form" && (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <h2 style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 22, marginBottom: 6 }}>Get Your Full Fix Plan</h2>
              <p style={{ color: "#5A7186", fontSize: 13 }}>Ray or Kelly reviews it personally — no call center hand-off.</p>
            </div>
            <form onSubmit={submitContact} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={label}>Your Name</label>
                <input value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} style={input} required />
              </div>
              <div>
                <label style={label}>Phone</label>
                <input type="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} style={input} required />
              </div>
              <button type="submit" style={{ background: "#0084CC", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "13px 0", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
                Continue to Book a Time &rarr;
              </button>
            </form>
          </div>
        )}

        {contactPhase === "submitting" && (
          <div style={{ ...card, textAlign: "center", color: "#5A7186" }}>Saving your info...</div>
        )}

        {contactPhase === "error" && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: "#C0392B", marginBottom: 12 }}>{errorMsg}</p>
            <button onClick={() => setContactPhase("form")} style={{ background: "#D3DEE7", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}>Try Again</button>
          </div>
        )}

        {contactPhase === "booking" && (
          <div style={card}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: 22, marginBottom: 6 }}>Pick a Time</h2>
              <p style={{ color: "#5A7186", fontSize: 13 }}>Got it, {contact.name}. Choose whatever works for you below.</p>
            </div>
            {CALENDAR_EMBED_URL ? (
              <div style={{ width: "100%", height: 600, borderRadius: 6, overflow: "hidden" }}>
                <iframe src={CALENDAR_EMBED_URL} style={{ width: "100%", height: "100%", border: "none" }} title="Book a call" />
              </div>
            ) : (
              <p style={{ textAlign: "center", color: "#5A7186", fontSize: 14 }}>
                Thanks — we've got your info and will reach out shortly to schedule.
                <br />
                <span style={{ fontSize: 12, color: "#C0392B" }}>(Calendar embed not yet configured — add CALENDAR_EMBED_URL in fix-plan.js)</span>
              </p>
            )}
          </div>
        )}

        <p style={{ color: "#6E8598", fontSize: 12, textAlign: "center", marginTop: 32, lineHeight: 1.6 }}>
          No AI platform guarantees inclusion in generated answers. Results reflect a
          point-in-time check, not a permanent status.
        </p>
      </div>
    </div>
  );
}
