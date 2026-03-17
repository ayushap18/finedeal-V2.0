"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ExtensionHeader from "@/components/ExtensionHeader";

interface PricePoint {
  date: string;
  price: number;
}

interface AiPrediction {
  trend?: string;
  prediction?: string;
  advice?: string;
  predicted_price?: number;
  confidence?: number;
}

export default function PriceHistoryPage() {
  const router = useRouter();
  const [productName, setProductName] = useState("");
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [stats, setStats] = useState({ current: 0, lowest: 0, average: 0 });
  const [aiPrediction, setAiPrediction] = useState<AiPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Step 1: Fetch first product
        const productsRes = await fetch("/api/products");
        if (!productsRes.ok) throw new Error("Failed to fetch products");
        const productsData = await productsRes.json();

        if (!productsData.products?.length) {
          setError("No tracked products found");
          setLoading(false);
          return;
        }

        const product = productsData.products[0];
        const name = String(product.name ?? "Product");
        if (cancelled) return;
        setProductName(name);

        const currentPrice = Number(product.current_price) || 0;
        const lowestPrice = Number(product.lowest_price) || currentPrice;
        const highestPrice = Number(product.highest_price) || currentPrice;

        setStats({
          current: currentPrice,
          lowest: lowestPrice,
          average: Math.round((lowestPrice + highestPrice) / 2),
        });

        // Step 2: Fetch price history
        const historyRes = await fetch(`/api/products/${product.id}`);
        if (!historyRes.ok) throw new Error("Failed to fetch price history");
        const historyData = await historyRes.json();

        if (cancelled) return;

        let historyPoints: PricePoint[] = [];
        if (historyData.price_history?.length > 0) {
          historyPoints = historyData.price_history
            .slice(-12)
            .map((h: { recorded_at?: string; date?: string; price: number }) => ({
              date: h.recorded_at || h.date || "",
              price: h.price,
            }));
          setHistory(historyPoints);

          // Recalculate stats from actual history
          const histPrices = historyPoints.map((h) => h.price).filter((p) => p > 0);
          if (histPrices.length > 0) {
            const lowest = Math.min(...histPrices);
            const avg = Math.round(histPrices.reduce((s, p) => s + p, 0) / histPrices.length);
            setStats({
              current: histPrices[histPrices.length - 1],
              lowest,
              average: avg,
            });
          }
        }

        setLoading(false);

        // Step 3: Get AI prediction
        if (historyPoints.length >= 2) {
          setAiLoading(true);
          try {
            const aiRes = await fetch("/api/ai", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "analyze",
                product: name,
                history: historyPoints.map((h) => ({
                  date: h.date,
                  price: h.price,
                })),
              }),
            });

            if (aiRes.ok && !cancelled) {
              const aiData = await aiRes.json();
              if (aiData.result) {
                setAiPrediction(aiData.result);
              }
            }
          } catch {
            // AI prediction is best-effort
          } finally {
            if (!cancelled) setAiLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // SVG Chart calculations
  const chartW = 340;
  const chartH = 140;
  const padTop = 15;
  const padBottom = 25;
  const padLeft = 50;
  const padRight = 15;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const prices = history.length > 0 ? history.map((h) => h.price) : [];
  const minP = prices.length > 0 ? Math.min(...prices) : 0;
  const maxP = prices.length > 0 ? Math.max(...prices) : 1;
  const range = maxP - minP || 1;
  const paddedMin = minP - range * 0.1;
  const paddedMax = maxP + range * 0.1;
  const paddedRange = paddedMax - paddedMin || 1;

  const points = prices.map((p, i) => {
    const x = padLeft + (prices.length > 1 ? (i / (prices.length - 1)) * plotW : plotW / 2);
    const y = padTop + (1 - (p - paddedMin) / paddedRange) * plotH;
    return { x, y };
  });

  const linePath =
    points.length > 0
      ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padTop + plotH} L ${points[0].x.toFixed(1)} ${padTop + plotH} Z`
      : "";

  // Date labels (first, middle, last)
  const dateLabels: { text: string; x: number }[] = [];
  if (history.length > 0) {
    const fmt = (d: string) => {
      try {
        return new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      } catch {
        return d;
      }
    };
    dateLabels.push({ text: fmt(history[0].date), x: padLeft });
    if (history.length > 2) {
      const mid = Math.floor(history.length / 2);
      dateLabels.push({
        text: fmt(history[mid].date),
        x: padLeft + (mid / (history.length - 1)) * plotW,
      });
    }
    dateLabels.push({
      text: fmt(history[history.length - 1].date),
      x: padLeft + plotW,
    });
  }

  // Grid lines
  const gridLines = 4;

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader title="Price History" showBack />

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <svg className="w-8 h-8 text-accent animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-text-secondary">Loading price history...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-text-secondary text-sm">{error}</p>
            </div>
          ) : (
            <>
              {/* Product Name */}
              {productName && (
                <p className="text-xs text-text-secondary truncate">{productName}</p>
              )}

              {/* SVG Line Chart */}
              <div className="rounded-lg border border-border bg-bg-card p-3">
                <p className="text-sm font-semibold text-text-primary">Price Trend</p>
                <div className="mt-3 rounded-md border border-border bg-bg-input p-2">
                  {points.length > 0 ? (
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-40">
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#F97316" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>

                      {/* Grid lines */}
                      {Array.from({ length: gridLines + 1 }).map((_, i) => {
                        const y = padTop + (i / gridLines) * plotH;
                        return (
                          <line
                            key={`grid-${i}`}
                            x1={padLeft}
                            y1={y}
                            x2={padLeft + plotW}
                            y2={y}
                            stroke="#1F1F1F"
                            strokeWidth="1"
                          />
                        );
                      })}

                      {/* Y-axis labels */}
                      <text x={padLeft - 5} y={padTop + 4} textAnchor="end" fontSize="9" fill="#888">
                        {`₹${Math.round(paddedMax).toLocaleString("en-IN")}`}
                      </text>
                      <text x={padLeft - 5} y={padTop + plotH + 4} textAnchor="end" fontSize="9" fill="#888">
                        {`₹${Math.round(paddedMin).toLocaleString("en-IN")}`}
                      </text>

                      {/* Area fill */}
                      <path d={areaPath} fill="url(#areaGradient)" />

                      {/* Line */}
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#F97316"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Dot markers */}
                      {points.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r="3.5"
                          fill="#F97316"
                          stroke="#1A1A1A"
                          strokeWidth="1.5"
                        />
                      ))}

                      {/* X-axis date labels */}
                      {dateLabels.map((d, i) => (
                        <text
                          key={`date-${i}`}
                          x={d.x}
                          y={chartH - 2}
                          textAnchor={i === 0 ? "start" : i === dateLabels.length - 1 ? "end" : "middle"}
                          fontSize="9"
                          fill="#888"
                        >
                          {d.text}
                        </text>
                      ))}
                    </svg>
                  ) : (
                    <div className="h-40 flex items-center justify-center">
                      <p className="text-xs text-text-tertiary">No price history data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats: Current, Lowest, Average */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Current", value: stats.current, color: "text-text-primary" },
                  { label: "Lowest", value: stats.lowest, color: "text-accent" },
                  { label: "Average", value: stats.average, color: "text-text-primary" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-border bg-bg-card p-3 text-center"
                  >
                    <p className="text-[10px] text-text-secondary">{stat.label}</p>
                    <p className={`mt-1 text-xs font-semibold ${stat.color}`}>
                      {stat.value > 0
                        ? `₹${stat.value.toLocaleString("en-IN")}`
                        : "—"}
                    </p>
                  </div>
                ))}
              </div>

              {/* AI Price Prediction */}
              <div className="rounded-lg border border-info/40 bg-info-tint p-3">
                <p className="text-xs font-semibold text-info">AI Price Prediction</p>

                {aiLoading ? (
                  <div className="mt-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-info animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                    <p className="text-xs text-text-secondary">Analyzing trends...</p>
                  </div>
                ) : aiPrediction ? (
                  <>
                    {aiPrediction.trend && (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-text-secondary">Trend</p>
                        <p className="text-sm font-semibold text-text-primary">
                          {aiPrediction.trend}
                        </p>
                      </div>
                    )}
                    {aiPrediction.prediction && (
                      <p className="mt-2 text-xs text-text-primary leading-relaxed">
                        {aiPrediction.prediction}
                      </p>
                    )}
                    {aiPrediction.predicted_price && (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-text-secondary">Predicted price</p>
                        <p className="text-sm font-bold text-text-primary">
                          ₹{aiPrediction.predicted_price.toLocaleString("en-IN")}
                        </p>
                      </div>
                    )}
                    {aiPrediction.advice && (
                      <p className="mt-2 text-xs text-text-secondary">
                        {aiPrediction.confidence
                          ? `${aiPrediction.confidence}% confidence · `
                          : ""}
                        {aiPrediction.advice}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-text-secondary italic">
                    {history.length < 2
                      ? "Not enough data for prediction"
                      : "AI prediction unavailable"}
                  </p>
                )}
              </div>

              {/* Set Price Drop Alert */}
              <button
                onClick={() => router.push("/extension/alert-setup")}
                className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-on-accent"
              >
                Set Price Drop Alert
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
