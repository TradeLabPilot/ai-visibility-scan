import { useState, useRef, useEffect } from "react";
import { Radar, ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";

// ---- CONFIG: swap these for your real values before sharing this link ----
const BOOKING_LINK = "https://get.agencyailab.com/widget/form/LZZSTp1yAYAS78EmxXF0";
const BONUS_TEXT = "Book within 24 hours and we'll include your directory sync setup free — a $500 value.";

const SCAN_LINES = [
  "Querying live AI sources...",
  "Checking directory citations...",
  "Cross-referencing competitor mentions...",
  "Compiling visibility verdict...",
];

export default function Home() {
  const [phase, setPhase] = useState("form");
  const [form, setForm] = useState({ businessName: "", industry: "", city: "" });
  const [lineIdx, setLineIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    if (phase === "scanning") {
      intervalRef.current = setInterval(() => {
        setLineIdx((i) => (i + 1) % SCAN_LINES.length);
      }, 1100);
    }
    return () => clearInterval(intervalRef.current);
  }, [phase]);

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const runScan = async (e) => {
    e.preventDefault();
    if (!form.businessName.trim() || !form.industry.trim() || !form.city.trim()) return;

    setPhase("scanning");
    setLineIdx(0);
    const startedAt = Date.now();

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      const elapsed = Date.now() - startedAt;
      const minWait = 2200;
      if (elapsed < minWait) await new Promise((r) => setTimeout(r, minWait - elapsed));

      if (data.parsed) {
        setResult(data.parsed);
        setPhase("result");
      } else {
        setErrorMsg(
          "Got a response back but couldn't parse a clean verdict. Raw model output: " +
            (data.raw || "").slice(0, 220)
        );
        setPhase("error");
      }
    } catch (err) {
      setErrorMsg("Scan failed — couldn't reach the live check. " + err.message);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("form");
    setResult(null);
    setErrorMsg("");
  };

  const card = { background: "#FAF7F0", border: "1px solid #D9D0BC", borderRadius: 16, padding: 24 };
  const label = { color: "#79705C", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", display: "block", marginBottom: 4 };
  const input = { background: "#EDE8DC", border: "1px solid #D9D0BC", color: "#221B12", width: "100%", borderRadius: 8, padding: "8px 12px", outline: "none", boxSizing: "border-box", fontSize: 14 };
  const goldBtn = { background: "#C2790E", color: "#FAF7F0", width: "100%", borderRadius: 8, padding: "12px 0", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", cursor: "pointer", fontSize: 15, textDecoration: "none" };

  return (
    <div style={{ background: "#EDE8DC", minHeight: "100vh", color: "#221B12", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes spinSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.45; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.12); } }
        @keyframes blipIn { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
        .sweep-anim { animation: spinSweep 2.8s linear infinite; }
        .pulse-glow { animation: pulseGlow 1.6s ease-in-out infinite; }
        .blip-in { animation: blipIn 0.5s ease-out both; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 448 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ color: "#8C826E", letterSpacing: "0.18em", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginBottom: 12 }}>
            Agency AI Lab — Visibility Scan
          </div>
          <h1 style={{ fontFamily: "Georgia, ui-serif, serif", letterSpacing: "-0.01em", color: "#221B12", fontSize: 30, lineHeight: 1.2, marginBottom: 8 }}>
            If AI can't see you,<br />you don't exist.
          </h1>
          <p style={{ color: "#79705C", fontSize: 14 }}>
            Find out whether AI recommends you — or your competitor.
          </p>
        </div>

        {phase === "form" && (
          <form onSubmit={runScan} style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }}>
            {[["businessName", "Business name"], ["industry", "Industry / trade"], ["city", "City"]].map(([field, text]) => (
              <div key={field}>
                <label style={label}>{text}</label>
                <input value={form[field]} onChange={handleChange(field)} style={input} placeholder={field === "city" ? "e.g. Orlando, FL" : ""} />
              </div>
            ))}
            <button type="submit" style={{ ...goldBtn, marginTop: 8 }}>
              <Radar size={18} /> Run Visibility Scan
            </button>
          </form>
        )}

        {phase === "scanning" && (
          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", padding: 32 }}>
            <div style={{ position: "relative", width: 180, height: 180 }}>
              <div style={{ position: "absolute", inset: 0, border: "1px solid #D9D0BC", borderRadius: 9999 }} />
              <div style={{ position: "absolute", inset: 22, border: "1px solid #D9D0BC", borderRadius: 9999 }} />
              <div className="sweep-anim" style={{ position: "absolute", inset: 0, borderRadius: 9999, background: "conic-gradient(from 0deg, rgba(194,121,14,0.35), transparent 35%)" }} />
              <div className="pulse-glow" style={{ position: "absolute", width: 14, height: 14, borderRadius: 9999, background: "#C2790E", top: "50%", left: "50%", marginTop: -7, marginLeft: -7 }} />
              {[0, 1, 2].map((i) =>
                i <= lineIdx ? (
                  <div key={i} className="blip-in" style={{ position: "absolute", width: 8, height: 8, borderRadius: 9999, background: "#A83A24", top: `${20 + i * 25}%`, left: i % 2 === 0 ? "18%" : "76%" }} />
                ) : null
              )}
            </div>
            <div style={{ color: "#79705C", fontFamily: "ui-monospace, monospace", fontSize: 14, marginTop: 24, textAlign: "center" }}>
              {SCAN_LINES[lineIdx]}
            </div>
          </div>
        )}

        {phase === "result" && result && (
          <div style={card}>
            <div style={{ color: result.cited ? "#C2790E" : "#A83A24", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              {result.cited ? "You're on the radar" : "You're invisible to AI"}
            </div>
            <p style={{ color: "#221B12", fontSize: 14, marginBottom: 16 }}>{result.note}</p>

            {result.competitors && result.competitors.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#79705C", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginBottom: 8 }}>
                  Named instead
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
                  {result.competitors.map((c, i) => (
                    <div key={i} style={{ color: "#221B12" }}>[{i + 1}] {c}</div>
                  ))}
                </div>
              </div>
            )}

            <a href={BOOKING_LINK} target="_blank" rel="noreferrer" style={goldBtn}>
              Get your fix plan <ArrowRight size={16} />
            </a>
            <p style={{ color: "#79705C", fontSize: 12, textAlign: "center", marginTop: 12 }}>{BONUS_TEXT}</p>

            <button onClick={reset} style={{ color: "#79705C", width: "100%", fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
              <RotateCcw size={12} /> Scan another business
            </button>
          </div>
        )}

        {phase === "error" && (
          <div style={card}>
            <div style={{ color: "#A83A24", display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 8 }}>
              <TriangleAlert size={18} /> Scan didn't complete
            </div>
            <p style={{ color: "#79705C", fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
            <button onClick={reset} style={{ background: "#D9D0BC", color: "#221B12", width: "100%", borderRadius: 8, padding: "8px 0", fontSize: 14, border: "none", cursor: "pointer" }}>
              Try again
            </button>
          </div>
        )}

        <p style={{ color: "#8C826E", fontSize: 12, textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
          No AI platform guarantees inclusion in generated answers. Results reflect a
          point-in-time check, not a permanent status.
        </p>
      </div>
    </div>
  );
}
