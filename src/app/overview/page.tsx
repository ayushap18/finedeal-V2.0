"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface UserData { id: string; email?: string; telegram_chat_id?: string; telegram_username?: string; browser: string; extension_version: string; last_active: string; status: string; products_tracked: number; alerts_count: number }
interface SiteHealth { name: string; key: string; status: string; ms: number; reason: string }

export default function OverviewPage() {
  const [stats, setStats] = useState({ products: 0, alerts: 0, drops: 0, accuracy: 0 });
  const [barData, setBarData] = useState<{ day: string; height: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [userStats, setUserStats] = useState({ total: 0, active: 0, with_email: 0, with_telegram: 0 });
  const [aiStatus, setAiStatus] = useState({ groq: "unknown", gemini: "unknown", groqModel: "", geminiModel: "" });
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeQuery, setScrapeQuery] = useState("Samsung Galaxy S24 Ultra");
  const [siteHealth, setSiteHealth] = useState<SiteHealth[]>([]);
  const [showModal, setShowModal] = useState<"" | "sites" | "users" | "scrapeResult">("");
  const [scrapeResults, setScrapeResults] = useState<{ platform: string; price: number | null; error?: string }[]>([]);
  const [pollingBot, setPollingBot] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/analytics").then(r => r.json()).then(d => {
      if (d.stats) setStats({ products: d.stats.total_products ?? 0, alerts: d.stats.active_alerts ?? 0, drops: d.stats.price_drops_today ?? 0, accuracy: d.stats.ai_accuracy ?? 0 });
      if (d.weekly_data?.length) {
        const mx = Math.max(...d.weekly_data.map((x: { scrapes: number }) => x.scrapes ?? 0), 1);
        setBarData(d.weekly_data.map((x: { day: string; scrapes: number }) => ({ day: x.day, height: Math.round(((x.scrapes ?? 0) / mx) * 100) })));
      }
    }).catch(() => {});
    fetch("/api/ai").then(r => r.json()).then(d => {
      setAiStatus({ groq: d.connectivity?.groq?.status ?? "unknown", gemini: d.connectivity?.gemini?.status ?? "unknown", groqModel: d.connectivity?.groq?.model ?? "", geminiModel: d.connectivity?.gemini?.model ?? "" });
    }).catch(() => {});
    fetch("/api/users").then(r => r.json()).then(d => {
      setUsers(d.users ?? []);
      setUserStats(d.stats ?? { total: 0, active: 0, with_email: 0, with_telegram: 0 });
    }).catch(() => {});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-poll Telegram bot every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/cron/telegram");
        const d = await res.json();
        if (d.processed?.length > 0) {
          setFeedback(`Bot: ${d.processed.join(", ")}`);
          load();
        }
      } catch { /* silent */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const processCSV = async (file: File) => {
    setImporting(true); setFeedback("");
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { setFeedback("Error: Need header + data"); setImporting(false); return; }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
      const data: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim().replace(/['"]/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { if (vals[idx]) row[h] = vals[idx]; });
        if (Object.keys(row).length > 0) data.push(row);
      }
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "products", data }) });
      const result = await res.json();
      setFeedback(result.results ? `Imported ${result.results.imported} products, ${result.results.skipped} skipped` : `Error: ${result.error}`);
      if (result.results?.imported > 0) load();
    } catch (e) { setFeedback(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
    finally { setImporting(false); }
  };

  const handleScrape = async () => {
    setScraping(true); setFeedback(""); setScrapeResults([]);
    try {
      const res = await fetch("/api/scraper", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: scrapeQuery, platforms: ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"] }) });
      const d = await res.json();
      const results = (d.results || []).map((r: { platform: string; price: number | null; error?: string }) => ({
        platform: r.platform, price: r.price, error: r.error,
      }));
      setScrapeResults(results);
      setShowModal("scrapeResult");
      const found = results.filter((r: { price: number | null }) => r.price).length;
      setFeedback(`Scrape done: ${found}/${results.length} sites returned prices (${d.duration_ms}ms)`);
      if (found > 0) load();
    } catch { setFeedback("Scrape failed"); }
    finally { setScraping(false); }
  };

  const checkSites = async () => {
    setSiteHealth([]); setShowModal("sites");
    const res = await fetch("/api/scraper/health");
    const d = await res.json();
    setSiteHealth(d.sites ?? []);
  };

  const pollBot = async () => {
    setPollingBot(true);
    try {
      const res = await fetch("/api/cron/telegram");
      const d = await res.json();
      if (d.processed?.length > 0) {
        setFeedback(`Bot: ${d.processed.join(", ")}`);
        load(); // Refresh user list
      } else {
        setFeedback("Bot: No new messages");
      }
    } catch { setFeedback("Bot poll failed"); }
    finally { setPollingBot(false); }
  };

  const sc = (s: string) => s === "working" || s === "connected" ? "bg-success" : s === "partial" ? "bg-warning" : "bg-error";
  const sl = (s: string) => s === "working" ? "Working" : s === "partial" ? "Partial" : s === "connected" ? "Connected" : s === "blocked" ? "Blocked" : "Error";

  if (loading) return <DashboardLayout><div className="p-6 flex items-center justify-center h-64"><p className="text-text-secondary">Loading...</p></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>
            <p className="text-[13px] text-text-secondary mt-1">Manage products, users, scraping, AI, and notifications</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-xs hover:text-text-primary disabled:opacity-50">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {importing ? "..." : "CSV"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processCSV(f); e.target.value = ""; }} />
            <button onClick={checkSites} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-xs hover:text-text-primary">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Sites
            </button>
            <button onClick={() => setShowModal("users")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-xs hover:text-text-primary">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              Users ({userStats.total})
            </button>
          </div>
        </div>

        {feedback && <div className="rounded-lg border border-border bg-bg-card p-3 text-sm text-text-secondary">{feedback}</div>}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Products", value: stats.products, color: "text-text-primary", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
            { label: "Alerts", value: stats.alerts, color: "text-accent", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg> },
            { label: "Ext. Users", value: userStats.total, color: "text-info", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
            { label: "AI Accuracy", value: `${stats.accuracy}%`, color: "text-success", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
          ].map(s => (
            <div key={s.label} className="bg-bg-card border border-border rounded-lg p-5 flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm">{s.label}</p>
                <p className={`text-[28px] font-bold mt-1 ${s.color}`}>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p>
              </div>
              <div className="text-text-tertiary mt-1">{s.icon}</div>
            </div>
          ))}
        </div>

        {/* Service Status */}
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary font-semibold">Services</h2>
            <button onClick={pollBot} disabled={pollingBot} className="text-xs text-accent hover:text-accent-hover disabled:opacity-50">
              {pollingBot ? "Polling..." : "Poll Telegram Bot"}
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { name: "Groq AI", status: aiStatus.groq, detail: aiStatus.groqModel || "Offline" },
              { name: "Gemini AI", status: aiStatus.gemini, detail: aiStatus.geminiModel || "Offline" },
              { name: "Email SMTP", status: "connected", detail: "Brevo relay" },
              { name: "Telegram Bot", status: "connected", detail: "@finedeal_bot" },
              { name: "Scraper", status: "connected", detail: "9 sites configured" },
            ].map(svc => (
              <div key={svc.name} className="flex items-center gap-3 bg-bg-page rounded-lg px-3 py-2.5">
                <span className={`h-2 w-2 rounded-full shrink-0 ${sc(svc.status)}`} />
                <div className="min-w-0">
                  <p className="text-text-primary text-xs font-medium truncate">{svc.name}</p>
                  <p className="text-text-tertiary text-[10px] truncate">{svc.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scraper */}
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-text-primary font-semibold mb-3">Scraper</h2>
          <div className="flex gap-3">
            <input value={scrapeQuery} onChange={e => setScrapeQuery(e.target.value)} placeholder="Product name..."
              className="flex-1 bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent" />
            <button onClick={handleScrape} disabled={scraping}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-text-on-accent text-sm font-medium disabled:opacity-50">
              {scraping ? "Scraping..." : "Scrape 9 Sites"}
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Run Alerts", icon: "bell", color: "text-accent", action: async () => { const r = await fetch("/api/cron"); const d = await r.json(); setFeedback(`Checked ${d.results?.length ?? 0} alerts`); } },
            { label: "Test Email", icon: "mail", color: "text-blue", action: async () => { const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", to: "9b4422001@smtp-brevo.com", subject: "FineDeal Test", message: "Test from admin panel" }) }); const d = await r.json(); setFeedback(d.result?.success ? "Email sent!" : `Email: ${d.error || "failed"}`); } },
            { label: "Test Telegram", icon: "send", color: "text-purple", action: async () => { const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "telegram", chat_id: "8295267041", message: "🧪 Test from FineDeal Admin" }) }); const d = await r.json(); setFeedback(d.result?.success ? "Telegram sent!" : `Telegram: ${d.error || "failed"}`); } },
            { label: "Import CSV", icon: "file", color: "text-success", action: () => fileRef.current?.click() },
            { label: "API Keys", icon: "key", color: "text-warning", action: () => window.location.href = "/api-settings" },
            { label: "View Logs", icon: "log", color: "text-info", action: () => window.location.href = "/system-logs" },
          ].map(btn => {
            const icons: Record<string, React.ReactNode> = {
              bell: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
              mail: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
              send: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
              file: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
              key: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
              log: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
            };
            return (
              <button key={btn.label} onClick={btn.action}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-bg-card border border-border hover:border-accent/40 transition-colors">
                <span className={btn.color}>{icons[btn.icon]}</span>
                <span className="text-text-primary text-[11px] font-medium">{btn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div className="bg-bg-card border border-border rounded-lg p-6">
          <h2 className="text-text-primary font-semibold mb-6">Weekly Activity</h2>
          <div className="flex items-end justify-between gap-3 h-40">
            {(barData.length > 0 ? barData : Array.from({ length: 7 }, (_, i) => ({ day: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], height: 0 }))).map(bar => (
              <div key={bar.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-md bg-accent/80 hover:bg-accent transition-colors" style={{ height: `${bar.height || 2}%` }} />
                <span className="text-text-tertiary text-xs">{bar.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MODALS */}
        {showModal === "sites" && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal("")}>
            <div className="bg-bg-sidebar border border-border rounded-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-text-primary font-semibold text-lg">Site Health</h2>
                <button onClick={() => setShowModal("")} className="text-text-secondary hover:text-text-primary"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              {siteHealth.length === 0 ? (
                <div className="py-8 text-center"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-text-secondary text-sm mt-4">Testing 9 sites...</p></div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {siteHealth.map(s => (
                    <div key={s.key} className="flex items-center justify-between bg-bg-card rounded-lg px-4 py-3 border border-border">
                      <div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${sc(s.status)}`} /><div><p className="text-text-primary text-sm font-medium">{s.name}</p><p className="text-text-tertiary text-xs">{s.reason}</p></div></div>
                      <div className="text-right"><p className={`text-xs font-medium ${s.status === "working" ? "text-success" : s.status === "partial" ? "text-warning" : "text-error"}`}>{sl(s.status)}</p><p className="text-text-tertiary text-[10px]">{s.ms}ms</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showModal === "users" && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal("")}>
            <div className="bg-bg-sidebar border border-border rounded-xl w-full max-w-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-text-primary font-semibold text-lg">Extension Users</h2>
                  <p className="text-text-secondary text-xs mt-1">{userStats.total} total · {userStats.active} active · {userStats.with_email} email · {userStats.with_telegram} telegram</p>
                </div>
                <button onClick={() => setShowModal("")} className="text-text-secondary hover:text-text-primary"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              {users.length === 0 ? (
                <div className="py-8 text-center text-text-secondary text-sm">No users yet. Users register when they use the extension or message @finedeal_bot.</div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between bg-bg-card rounded-lg px-4 py-3 border border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-tint flex items-center justify-center text-accent text-xs font-bold">{(u.email?.[0] || u.telegram_username?.[0] || "U").toUpperCase()}</div>
                        <div>
                          <p className="text-text-primary text-sm font-medium">{u.email || `@${u.telegram_username}` || u.id.slice(0, 8)}</p>
                          <p className="text-text-tertiary text-xs">{u.browser} · v{u.extension_version} · Last: {new Date(u.last_active).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.email && <span className="text-info" title="Email">✉</span>}
                        {u.telegram_chat_id && <span className="text-purple" title="Telegram">✈</span>}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${u.status === "active" ? "bg-success-tint text-success" : "bg-border text-text-tertiary"}`}>{u.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showModal === "scrapeResult" && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowModal("")}>
            <div className="bg-bg-sidebar border border-border rounded-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-text-primary font-semibold text-lg">Scrape Results: {scrapeQuery}</h2>
                <button onClick={() => setShowModal("")} className="text-text-secondary hover:text-text-primary"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="space-y-2">
                {scrapeResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-bg-card rounded-lg px-4 py-3 border border-border">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${r.price ? "bg-success" : "bg-error"}`} />
                      <p className="text-text-primary text-sm font-medium">{r.platform}</p>
                    </div>
                    <p className={`text-sm font-semibold ${r.price ? "text-success" : "text-text-tertiary"}`}>
                      {r.price ? `₹${r.price.toLocaleString("en-IN")}` : r.error?.split(":")[0] || "No data"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
