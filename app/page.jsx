"use client";

import { useState, useEffect, useCallback } from "react";

// ─── CONFIG — fill these in before deploying ──────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJpDn6SlbykmbU4tJEmjTq_ogeOJgnBeRVSJGlfNedmet9ROtyNb8JcxWEUCM6Rl1bMg/exec";
// ─────────────────────────────────────────────────────────────────────────────

const COMMISSION_PER_SALE = 50;

const C = {
  bg: "#F5F0E8",
  cream: "#FAF7F2",
  card: "#FFFFFF",
  border: "#E2D9C8",
  borderDark: "#C8B99A",
  green: "#2C4A3E",
  greenLight: "#3D6355",
  gold: "#B8860B",
  text: "#1A2E26",
  muted: "#7A8C7E",
  soft: "#EDE8DF",
  purple: "#6B5B7B",
  white: "#FFFFFF",
  error: "#C0392B",
};

const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function formatMonthLabel(key) {
  const [year, month] = key.split("-");
  return `${monthNames[parseInt(month)]} ${year}`;
}

// ─── Google Sheets API helpers ────────────────────────────────────────────────

async function fetchSales() {
  const res = await fetch(APPS_SCRIPT_URL, { method: "GET" });
  if (!res.ok) throw new Error(`GET failed: ${res.status}`);
  const data = await res.json();
  // Normalise commission to number in case Sheets returns string
  return data.map(s => ({ ...s, commission: Number(s.commission) }));
}

async function postSale(sale) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // Apps Script requires text/plain for doPost
    body: JSON.stringify(sale),
  });
  if (!res.ok) throw new Error(`POST failed: ${res.status}`);
  return await res.json();
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("log");
  const [ceoTab, setCeoTab] = useState("staff");
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    staff: "",
    memberName: "",
    date: new Date().toISOString().split("T")[0],
    referral: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  // Load sales from Google Sheets on mount
  const loadSales = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchSales();
      setSales(data);
    } catch (e) {
      setError("Could not load sales data. Check your connection.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSales(); }, [loadSales]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const allMonths = [...new Set(sales.map(s => getMonthKey(s.date)))].sort().reverse();
  if (!allMonths.includes(getCurrentMonthKey())) allMonths.unshift(getCurrentMonthKey());

  const filteredSales = sales.filter(s => getMonthKey(s.date) === selectedMonth);
  const directSales = filteredSales.filter(s => !String(s.referral).trim());
  const referralSales = filteredSales.filter(s => String(s.referral).trim());

  // Staff leaderboard — case-insensitive grouping
  const staffMap = {};
  filteredSales.forEach(s => {
    const key = String(s.staff).trim().toLowerCase();
    const display = String(s.staff).trim();
    if (!staffMap[key]) staffMap[key] = { name: display, direct: 0, referral: 0 };
    if (String(s.referral).trim()) staffMap[key].referral++;
    else staffMap[key].direct++;
  });
  const staffLeaderboard = Object.values(staffMap)
    .map(s => ({ ...s, total: s.direct + s.referral, commission: s.direct * COMMISSION_PER_SALE }))
    .sort((a, b) => b.total - a.total);

  // Referral leaderboard
  const referralMap = {};
  referralSales.forEach(s => {
    const key = String(s.referral).trim().toLowerCase();
    const display = String(s.referral).trim();
    if (!referralMap[key]) referralMap[key] = { name: display, closes: 0 };
    referralMap[key].closes++;
  });
  const referralLeaderboard = Object.values(referralMap).sort((a, b) => b.closes - a.closes);

  const totalCommission = directSales.length * COMMISSION_PER_SALE;
  const hasReferral = form.referral.trim().length > 0;
  const canSubmit = form.staff.trim() && form.memberName.trim() && form.date;

  // My stats (log view)
  const myKey = form.staff.trim().toLowerCase();
  const myMonthSales = sales.filter(s =>
    String(s.staff).trim().toLowerCase() === myKey &&
    getMonthKey(s.date) === getCurrentMonthKey()
  );
  const myMonthDirect = myMonthSales.filter(s => !String(s.referral).trim());
  const myMonthReferral = myMonthSales.filter(s => String(s.referral).trim());
  const myRecent = sales.filter(s => String(s.staff).trim().toLowerCase() === myKey).slice(0, 6);

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!canSubmit || syncing) return;
    const newSale = {
      id: Date.now(),
      staff: form.staff.trim(),
      memberName: form.memberName.trim(),
      date: form.date,
      referral: form.referral.trim(),
      commission: hasReferral ? 0 : COMMISSION_PER_SALE,
      loggedAt: new Date().toISOString(),
    };
    setSyncing(true);
    setError(null);
    try {
      await postSale(newSale);
      // Optimistically update local state immediately
      setSales(prev => [newSale, ...prev]);
      setForm(f => ({ ...f, memberName: "", referral: "", date: new Date().toISOString().split("T")[0] }));
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
    } catch (e) {
      setError("Failed to save sale. Please try again.");
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Jost:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F5F0E8; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #EDE8DF; }
        ::-webkit-scrollbar-thumb { background: #C8B99A; border-radius: 2px; }
        .sans { font-family: 'Jost', sans-serif; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: 'Jost', sans-serif; transition: all 0.2s; letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px; font-weight: 500; }
        .sub-tab { background: none; border: none; border-bottom: 1.5px solid transparent; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 11px; font-weight: 500; padding: 8px 0; color: #7A8C7E; transition: all 0.2s; letter-spacing: 0.1em; text-transform: uppercase; }
        .sub-tab.active { border-bottom-color: #2C4A3E; color: #2C4A3E; }
        .primary-btn { border: none; cursor: pointer; font-family: 'Jost', sans-serif; font-weight: 500; font-size: 12px; padding: 15px 0; width: 100%; transition: all 0.2s; letter-spacing: 0.15em; text-transform: uppercase; }
        .primary-btn:disabled { background: #EDE8DF !important; color: #7A8C7E !important; cursor: not-allowed; border: 1px solid #E2D9C8 !important; }
        .primary-btn:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
        input { background: #FFFFFF; border: 1px solid #E2D9C8; color: #1A2E26; font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 300; padding: 13px 16px; border-radius: 0; width: 100%; outline: none; transition: border 0.2s; letter-spacing: 0.03em; }
        input:focus { border-color: #2C4A3E; }
        input::placeholder { color: #7A8C7E; font-weight: 300; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        .month-pill { background: none; border: 1px solid #E2D9C8; color: #7A8C7E; font-family: 'Jost', sans-serif; font-size: 10px; font-weight: 500; padding: 5px 12px; border-radius: 20px; cursor: pointer; transition: all 0.15s; letter-spacing: 0.1em; text-transform: uppercase; }
        .month-pill.active { border-color: #2C4A3E; color: #2C4A3E; background: rgba(44,74,62,0.06); }
        @keyframes fadeUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
        .fade-in { animation: fadeUp 0.35s ease; }
        @keyframes pop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        .pop { animation: pop 0.3s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
        .stat-card { background: #FFFFFF; border: 1px solid #E2D9C8; padding: 20px 16px; }
        .ornament { color: #B8860B; font-size: 14px; letter-spacing: 4px; }
        .error-bar { background: rgba(192,57,43,0.08); border: 1px solid rgba(192,57,43,0.25); color: #C0392B; font-family: 'Jost', sans-serif; font-size: 12px; padding: 10px 16px; letter-spacing: 0.03em; margin-bottom: 16px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: C.green, padding: "0 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: C.gold, fontSize: 18, letterSpacing: 2 }}>✦</span>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", color: C.white, fontSize: 18, fontWeight: 500, letterSpacing: "0.06em", lineHeight: 1 }}>Prana</div>
              <div className="sans" style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 2 }}>Commissions</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.08)", padding: 3, borderRadius: 4 }}>
            {[["log", "Log Sale"], ["ceo", "CEO View"]].map(([v, label]) => (
              <button key={v} className="tab-btn" onClick={() => setView(v)} style={{
                padding: "7px 14px", borderRadius: 3,
                background: view === v ? C.gold : "none",
                color: view === v ? C.white : "rgba(255,255,255,0.55)",
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ width: 24, height: 24, border: `2px solid ${C.border}`, borderTopColor: C.green, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 16px" }} />
          <div className="sans" style={{ fontSize: 12, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Loading sales data...</div>
        </div>
      )}

      {/* ── LOG SALE VIEW ── */}
      {!loading && view === "log" && (
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "44px 24px 60px" }} className="fade-in">
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div className="ornament">✦ ✦ ✦</div>
            <h1 style={{ fontSize: 34, fontWeight: 400, marginTop: 12, marginBottom: 6, fontStyle: "italic" }}>Log a Sale</h1>
            <p className="sans" style={{ color: C.muted, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Direct close = <span style={{ color: C.green, fontWeight: 500 }}>$50</span>
              &nbsp;·&nbsp;
              Referral = <span style={{ color: C.purple, fontWeight: 500 }}>$0</span>
            </p>
          </div>

          {error && <div className="error-bar">⚠ {error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Your Name */}
            <div>
              <label className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Your Name</label>
              <input
                type="text"
                placeholder="Enter your name..."
                value={form.staff}
                onChange={e => setForm(f => ({ ...f, staff: e.target.value }))}
                autoComplete="name"
              />
            </div>

            {/* Member Name */}
            <div>
              <label className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Member Name</label>
              <input
                type="text"
                placeholder="e.g. Jessica Thompson"
                value={form.memberName}
                onChange={e => setForm(f => ({ ...f, memberName: e.target.value }))}
              />
            </div>

            {/* Date */}
            <div>
              <label className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* Referral */}
            <div>
              <label className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Referral Source <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 11 }}>(leave blank if none)</span>
              </label>
              <input
                type="text"
                placeholder="Ambassador or instructor name..."
                value={form.referral}
                onChange={e => setForm(f => ({ ...f, referral: e.target.value }))}
              />
              {hasReferral && (
                <div className="sans" style={{ marginTop: 8, background: "rgba(107,91,123,0.07)", border: "1px solid rgba(107,91,123,0.2)", padding: "10px 14px", fontSize: 12, color: C.purple, letterSpacing: "0.04em" }}>
                  Referral logged — no commission paid for this sale
                </div>
              )}
            </div>

            {/* Submit button */}
            <button
              className={`primary-btn ${submitted ? "pop" : ""}`}
              onClick={handleSubmit}
              disabled={!canSubmit || syncing}
              style={{
                marginTop: 10,
                background: submitted ? C.greenLight : hasReferral ? "rgba(107,91,123,0.12)" : C.green,
                color: submitted ? C.white : hasReferral ? C.purple : C.white,
                border: hasReferral && !submitted ? "1px solid rgba(107,91,123,0.3)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {syncing
                ? <><span className="spinner" /> Saving...</>
                : submitted
                  ? "✓ Sale Logged"
                  : hasReferral
                    ? "Log Referral Sale"
                    : "Log Sale — $50"
              }
            </button>
          </div>

          {/* My month summary */}
          {form.staff.trim() && myRecent.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ width: 40, height: 1, background: C.borderDark, margin: "0 auto" }} />
                <div className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 14 }}>
                  {monthNames[new Date().getMonth()]} Summary
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: myMonthReferral.length > 0 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 24 }}>
                <div className="stat-card" style={{ textAlign: "center" }}>
                  <div className="sans" style={{ fontSize: 9, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>Commission</div>
                  <div style={{ fontSize: 28, fontWeight: 300, color: C.green, fontStyle: "italic" }}>${myMonthDirect.length * COMMISSION_PER_SALE}</div>
                </div>
                {myMonthReferral.length > 0 && (
                  <div className="stat-card" style={{ textAlign: "center" }}>
                    <div className="sans" style={{ fontSize: 9, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>Referral Closes</div>
                    <div style={{ fontSize: 28, fontWeight: 300, color: C.purple, fontStyle: "italic" }}>{myMonthReferral.length}</div>
                  </div>
                )}
              </div>

              <div className="sans" style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Recent Sales</div>
              <div style={{ background: C.white, border: `1px solid ${C.border}` }}>
                {myRecent.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < myRecent.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div style={{ fontSize: 15 }}>{s.memberName}</div>
                      {s.referral && <div className="sans" style={{ fontSize: 11, color: C.purple, marginTop: 2 }}>via {s.referral}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="sans" style={{ fontSize: 12, color: s.referral ? C.purple : C.green, fontWeight: 500 }}>{s.referral ? "ref" : "+$50"}</div>
                      <div className="sans" style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CEO VIEW ── */}
      {!loading && view === "ceo" && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "44px 24px 60px" }} className="fade-in">
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div className="ornament">✦ ✦ ✦</div>
            <h1 style={{ fontSize: 34, fontWeight: 400, marginTop: 12, marginBottom: 6, fontStyle: "italic" }}>Commission Overview</h1>
            <p className="sans" style={{ color: C.muted, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>$50 per direct close · referrals tracked separately</p>
          </div>

          {error && <div className="error-bar">⚠ {error}</div>}

          {/* Refresh button */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <button
              className="sans"
              onClick={loadSales}
              disabled={loading}
              style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 16px", borderRadius: 20, transition: "all 0.15s" }}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Month picker */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28, justifyContent: "center" }}>
            {allMonths.map(m => (
              <button key={m} className={`month-pill ${selectedMonth === m ? "active" : ""}`} onClick={() => setSelectedMonth(m)}>
                {formatMonthLabel(m)}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 }}>
            {[
              { label: "Direct Sales", value: directSales.length, color: C.green },
              { label: "Referral Sales", value: referralSales.length, color: C.purple },
              { label: "Commission Out", value: `$${totalCommission}`, color: C.gold },
            ].map(card => (
              <div key={card.label} className="stat-card" style={{ textAlign: "center" }}>
                <div className="sans" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 300, fontStyle: "italic", color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 28, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
            {[["staff", "Staff Commissions"], ["referrals", "Referral Board"], ["log", "All Sales"]].map(([key, label]) => (
              <button key={key} className={`sub-tab ${ceoTab === key ? "active" : ""}`} onClick={() => setCeoTab(key)}>{label}</button>
            ))}
          </div>

          {/* STAFF TAB */}
          {ceoTab === "staff" && (
            <div style={{ background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px 70px", gap: 8, padding: "10px 18px", borderBottom: `1px solid ${C.border}`, background: C.soft }}>
                {["Staff", "Direct", "Ref", "Earned"].map((h, i) => (
                  <span key={h} className="sans" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", textAlign: i > 0 ? "right" : "left" }}>{h}</span>
                ))}
              </div>
              {staffLeaderboard.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div className="sans" style={{ fontSize: 13, color: C.muted }}>No sales logged for {formatMonthLabel(selectedMonth)}</div>
                </div>
              )}
              {staffLeaderboard.map((s, i) => (
                <div key={s.name} style={{
                  display: "grid", gridTemplateColumns: "1fr 56px 56px 70px", gap: 8, alignItems: "center",
                  padding: "14px 18px", borderBottom: i < staffLeaderboard.length - 1 ? `1px solid ${C.border}` : "none",
                  background: i === 0 ? "rgba(44,74,62,0.03)" : "none"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {i === 0 && <span style={{ color: C.gold, fontSize: 13 }}>✦</span>}
                    <span style={{ fontSize: 16, fontWeight: i === 0 ? 500 : 400 }}>{s.name}</span>
                  </div>
                  <span className="sans" style={{ fontSize: 13, color: s.direct > 0 ? C.green : C.muted, textAlign: "right", fontWeight: 500 }}>{s.direct}</span>
                  <span className="sans" style={{ fontSize: 13, color: s.referral > 0 ? C.purple : C.muted, textAlign: "right", fontWeight: 500 }}>{s.referral}</span>
                  <span className="sans" style={{ fontSize: 13, color: s.commission > 0 ? C.gold : C.muted, textAlign: "right", fontWeight: 600 }}>${s.commission}</span>
                </div>
              ))}
            </div>
          )}

          {/* REFERRAL TAB */}
          {ceoTab === "referrals" && (
            referralLeaderboard.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 22, color: C.borderDark, marginBottom: 8 }}>✦</div>
                <div className="sans" style={{ fontSize: 13, color: C.muted }}>No referral closes for {formatMonthLabel(selectedMonth)}</div>
              </div>
            ) : (
              <div style={{ background: C.white, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderBottom: `1px solid ${C.border}`, background: C.soft }}>
                  <span className="sans" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Ambassador / Instructor</span>
                  <span className="sans" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Closes</span>
                </div>
                {referralLeaderboard.map((r, i) => (
                  <div key={r.name} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px", borderBottom: i < referralLeaderboard.length - 1 ? `1px solid ${C.border}` : "none",
                    background: i === 0 ? "rgba(107,91,123,0.03)" : "none"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {i === 0 && <span style={{ color: C.gold, fontSize: 12 }}>✦</span>}
                      <span style={{ fontSize: 16, color: C.purple, fontWeight: i === 0 ? 500 : 400 }}>{r.name}</span>
                    </div>
                    <span className="sans" style={{ fontSize: 16, color: C.purple, fontWeight: 600 }}>{r.closes}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ALL SALES TAB */}
          {ceoTab === "log" && (
            filteredSales.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 22, color: C.borderDark, marginBottom: 8 }}>✦</div>
                <div className="sans" style={{ fontSize: 13, color: C.muted }}>No sales logged for {formatMonthLabel(selectedMonth)}</div>
              </div>
            ) : (
              <div style={{ background: C.white, border: `1px solid ${C.border}` }}>
                {filteredSales.map((s, i) => (
                  <div key={s.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "13px 18px", borderBottom: i < filteredSales.length - 1 ? `1px solid ${C.border}` : "none"
                  }}>
                    <div>
                      <div style={{ fontSize: 16 }}>{s.memberName}</div>
                      <div className="sans" style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {s.staff}
                        {s.referral && <span style={{ color: C.purple }}> · via {s.referral}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="sans" style={{ fontSize: 12, color: s.referral ? C.purple : C.green, fontWeight: 600 }}>{s.referral ? "ref" : "$50"}</div>
                      <div className="sans" style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
