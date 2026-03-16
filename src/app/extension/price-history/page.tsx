"use client";

import { useState, useEffect } from "react";
import ExtensionHeader from "@/components/ExtensionHeader";

interface PricePoint { date: string; price: number }

export default function PriceHistoryPage() {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [stats, setStats] = useState({ current: 129999, lowest: 109999, average: 124499 });

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products?.length > 0) {
          const p = data.products[0];
          setStats({
            current: p.current_price ?? 129999,
            lowest: p.lowest_price ?? 109999,
            average: Math.round(((p.lowest_price ?? 109999) + (p.highest_price ?? 139999)) / 2),
          });
          return fetch(`/api/products/${p.id}`);
        }
      })
      .then((res) => res?.json())
      .then((data) => {
        if (data?.price_history?.length > 0) {
          setHistory(data.price_history.slice(-10).map((h: { recorded_at?: string; date?: string; price: number }) => ({
            date: h.recorded_at || h.date || "",
            price: h.price,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const chartW = 320;
  const chartH = 120;
  const padding = 10;
  const prices = history.length > 0 ? history.map((h) => h.price) : [129999, 125999, 130999, 115999, 120999, 109999, 118999, 122999, 127999, 129999];
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (chartW - 2 * padding);
    const y = padding + (1 - (p - minP) / range) * (chartH - 2 * padding);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`;

  const dateLabels = history.length > 0
    ? [history[0]?.date, history[Math.floor(history.length / 3)]?.date, history[Math.floor(2 * history.length / 3)]?.date, history[history.length - 1]?.date]
      .map((d) => d ? new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "")
    : ["Feb 15", "Feb 25", "Mar 5", "Mar 15"];

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader title="Price History" showBack />

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-border bg-bg-card p-3">
            <p className="text-sm font-semibold text-text-primary">30-Day Price Trend</p>
            <div className="mt-3 rounded-md border border-border bg-bg-input p-3">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#areaGrad)" />
                <path d={linePath} fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3" fill="#F97316" stroke="#1A1A1A" strokeWidth="1.5" />
                ))}
              </svg>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-text-tertiary">
              {dateLabels.map((d, i) => <span key={i}>{d}</span>)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Current", value: `₹${stats.current.toLocaleString("en-IN")}`, color: "text-text-primary" },
              { label: "Lowest", value: `₹${stats.lowest.toLocaleString("en-IN")}`, color: "text-accent" },
              { label: "Average", value: `₹${stats.average.toLocaleString("en-IN")}`, color: "text-text-primary" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-bg-card p-3 text-center">
                <p className="text-[10px] text-text-secondary">{stat.label}</p>
                <p className={`mt-1 text-xs font-semibold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-info/40 bg-info-tint p-3">
            <p className="text-xs font-semibold text-info">AI Price Prediction</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-text-secondary">Predicted in 7 days</p>
              <p className="text-sm font-bold text-text-primary">₹{Math.round(stats.current * 0.92).toLocaleString("en-IN")}</p>
            </div>
            <p className="mt-2 text-xs text-text-secondary">78% confidence · Recommendation: WAIT</p>
          </div>

          <button
            onClick={() => window.location.href = "/extension/alert-setup"}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-on-accent"
          >
            Set Price Drop Alert
          </button>
        </div>
      </div>
    </div>
  );
}
