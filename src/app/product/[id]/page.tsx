"use client";

import { useState, useEffect, use } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";

interface Product {
  id: string; name: string; platform: string; category: string;
  current_price: number; original_price: number; lowest_price: number; highest_price: number;
  last_checked: string; status: string; url: string;
}
interface PriceHistory { date: string; price: number; platform: string }

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<{ platform: string; price: number | null; error?: string }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState("");

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.product) setProduct(d.product);
        if (d.price_history) {
          setHistory(d.price_history.sort((a: PriceHistory, b: PriceHistory) => a.date.localeCompare(b.date)).slice(-30));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleScrape = async () => {
    if (!product) return;
    setScraping(true); setScrapeResults([]);
    try {
      const r = await fetch("/api/scraper", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: product.name, platforms: ["amazon","flipkart","croma","snapdeal","tatacliq","ajio","nykaa","vijaysales"] }),
      });
      const d = await r.json();
      setScrapeResults((d.results || []).map((r: { platform: string; price: number | null; error?: string }) => ({ platform: r.platform, price: r.price, error: r.error })));
    } catch {} finally { setScraping(false); }
  };

  const handleAiAnalysis = async () => {
    if (!product || history.length < 2) { setAiAnalysis("Not enough data for AI analysis."); return; }
    setAiAnalysis("Analyzing...");
    try {
      const r = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          product: product.name,
          history: history.slice(-10).map(h => ({ date: h.date.split("T")[0], price: h.price })),
        }),
      });
      const d = await r.json();
      if (d.result) {
        setAiAnalysis(`Trend: ${d.result.trend}\nPrediction: ${d.result.prediction}\nAdvice: ${d.result.advice}`);
      } else {
        setAiAnalysis(d.error || "Analysis failed");
      }
    } catch { setAiAnalysis("AI analysis failed"); }
  };

  // SVG chart
  const chartW = 700, chartH = 200, pad = 30;
  const prices = history.length > 0 ? history.map(h => h.price) : [0];
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const points = prices.map((p, i) => ({
    x: pad + (i / Math.max(prices.length - 1, 1)) * (chartW - 2 * pad),
    y: pad + (1 - (p - minP) / range) * (chartH - 2 * pad),
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${chartH - pad} L ${points[0].x} ${chartH - pad} Z`;

  if (loading) return <DashboardLayout><div className="p-8 flex items-center justify-center h-64"><p className="text-text-secondary">Loading...</p></div></DashboardLayout>;
  if (!product) return <DashboardLayout><div className="p-8 text-center"><p className="text-text-secondary">Product not found</p><Link href="/tracked-products" className="text-accent mt-4 inline-block">Back to products</Link></div></DashboardLayout>;

  const savings = product.original_price > product.current_price ? product.original_price - product.current_price : 0;
  const discount = product.original_price > 0 ? Math.round((savings / product.original_price) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/tracked-products" className="text-text-tertiary text-xs hover:text-text-secondary mb-2 inline-block">← Back to Products</Link>
            <h1 className="text-2xl font-bold text-text-primary">{product.name}</h1>
            <p className="text-text-secondary text-sm mt-1">{product.platform} · {product.category} · Last checked: {product.last_checked ? new Date(product.last_checked).toLocaleString() : "Never"}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleScrape} disabled={scraping} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-text-on-accent text-sm font-medium disabled:opacity-50">
              {scraping ? "Scraping..." : "Compare Prices"}
            </button>
            <button onClick={handleAiAnalysis} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-sm hover:text-text-primary">
              AI Analysis
            </button>
          </div>
        </div>

        {/* Price Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <p className="text-text-secondary text-xs">Current Price</p>
            <p className="text-2xl font-bold text-text-primary mt-1">₹{product.current_price.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <p className="text-text-secondary text-xs">Original MRP</p>
            <p className="text-2xl font-bold text-text-tertiary mt-1 line-through">₹{product.original_price.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <p className="text-text-secondary text-xs">Lowest Ever</p>
            <p className="text-2xl font-bold text-success mt-1">₹{product.lowest_price.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <p className="text-text-secondary text-xs">Highest</p>
            <p className="text-2xl font-bold text-error mt-1">₹{product.highest_price.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <p className="text-text-secondary text-xs">You Save</p>
            <p className="text-2xl font-bold text-accent mt-1">{discount}%</p>
            <p className="text-success text-xs">₹{savings.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {/* Price History Chart */}
        <div className="bg-bg-card border border-border rounded-lg p-6">
          <h2 className="text-text-primary font-semibold mb-4">Price History ({history.length} data points)</h2>
          {history.length > 1 ? (
            <svg viewBox={`0 0 ${chartW} ${chartH + 20}`} className="w-full h-52">
              <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F97316" stopOpacity="0.2"/><stop offset="100%" stopColor="#F97316" stopOpacity="0.02"/></linearGradient></defs>
              {[0,1,2,3,4].map(i => { const y = pad + (i/4)*(chartH-2*pad); return <line key={i} x1={pad} y1={y} x2={chartW-pad} y2={y} stroke="#1F1F1F" strokeWidth="1"/>; })}
              <path d={area} fill="url(#pg)"/>
              <path d={line} fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              {points.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#F97316" stroke="#1A1A1A" strokeWidth="1.5"/>)}
              {/* Y-axis labels */}
              <text x={5} y={pad+5} fill="#666" fontSize="10">₹{maxP.toLocaleString("en-IN")}</text>
              <text x={5} y={chartH-pad+5} fill="#666" fontSize="10">₹{minP.toLocaleString("en-IN")}</text>
            </svg>
          ) : (
            <p className="text-text-tertiary text-sm py-8 text-center">Not enough price history data. Click &quot;Compare Prices&quot; to start tracking.</p>
          )}
        </div>

        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Platform Comparison */}
          <div className="flex-1 bg-bg-card border border-border rounded-lg p-6">
            <h2 className="text-text-primary font-semibold mb-4">Platform Prices</h2>
            {scrapeResults.length > 0 ? (
              <div className="space-y-2">
                {scrapeResults.filter(r => r.price && r.price > 0).sort((a,b) => (a.price||0)-(b.price||0)).map((r, i) => (
                  <div key={r.platform} className={`flex items-center justify-between rounded-lg px-4 py-3 ${i===0 ? "bg-success-tint border border-success/30" : "bg-bg-page"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${i===0?"bg-success":"bg-text-tertiary"}`}/>
                      <span className="text-text-primary text-sm font-medium">{r.platform}</span>
                      {i===0 && <span className="text-xs text-success bg-success-tint px-2 py-0.5 rounded-full font-medium">Best</span>}
                    </div>
                    <span className={`font-bold ${i===0?"text-success":"text-text-primary"}`}>₹{r.price!.toLocaleString("en-IN")}</span>
                  </div>
                ))}
                {scrapeResults.filter(r => !r.price || r.price <= 0).map(r => (
                  <div key={r.platform} className="flex items-center justify-between rounded-lg px-4 py-2 bg-bg-page opacity-50">
                    <span className="text-text-tertiary text-sm">{r.platform}</span>
                    <span className="text-text-tertiary text-xs">{r.error?.split(":")[0] || "No data"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-tertiary text-sm py-4 text-center">Click &quot;Compare Prices&quot; to see prices across 9 sites</p>
            )}
          </div>

          {/* AI Analysis */}
          <div className="w-full lg:w-[350px] bg-bg-card border border-border rounded-lg p-6">
            <h2 className="text-text-primary font-semibold mb-4">AI Analysis</h2>
            {aiAnalysis ? (
              <pre className="text-text-secondary text-sm whitespace-pre-wrap font-sans">{aiAnalysis}</pre>
            ) : (
              <p className="text-text-tertiary text-sm py-4 text-center">Click &quot;AI Analysis&quot; for price prediction and buying advice</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
