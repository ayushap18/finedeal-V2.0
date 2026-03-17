"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ExtensionHeader from "@/components/ExtensionHeader";

interface ScraperResult {
  platform: string;
  name: string;
  price: number | null;
  url?: string;
  error?: string;
}

interface AiAnalysis {
  recommendation?: string;
  bestDeal?: { platform: string; price: number; name: string };
  confidence?: number;
  priceInsight?: string;
  shouldBuy?: boolean;
}

interface GeminiAnalysis {
  dealSummary?: { summary: string };
  priceAnalysis?: {
    bestDeal: { platform: string; price: number; name: string };
    recommendation: string;
    confidence: number;
    priceInsight: string;
    shouldBuy: boolean;
  };
  dealScore?: number;
}

interface PriceCard {
  platform: string;
  title: string;
  price: number;
  priceFormatted: string;
  meta: string;
  best: boolean;
}

export default function ResultsPage() {
  const [prices, setPrices] = useState<PriceCard[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let results: ScraperResult[] = [];
    let gotData = false;

    // Try sessionStorage first
    try {
      const stored = sessionStorage.getItem("finedeal_results");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.results?.length > 0) {
          results = data.results;
          setAiAnalysis(data.aiAnalysis ?? null);
          setGeminiAnalysis(data.geminiAnalysis ?? null);
          setQuery(data.query ?? "");
          gotData = true;
        }
      }
    } catch {}

    if (gotData) {
      buildCards(results);
      setLoading(false);
      return;
    }

    // Fallback: GET /api/scraper for lastResults
    fetch("/api/scraper")
      .then((res) => res.json())
      .then((data) => {
        if (data.lastResults?.length > 0) {
          results = data.lastResults;
          buildCards(results);

          // Also call AI compare for recommendation
          const validResults = results.filter((r) => r.price !== null && r.price > 0);
          if (validResults.length >= 1) {
            fetch("/api/ai", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "compare",
                products: validResults.map((r) => ({
                  name: r.name,
                  price: r.price,
                  platform: r.platform,
                })),
              }),
            })
              .then((res) => res.json())
              .then((aiData) => {
                if (aiData.result) setAiAnalysis(aiData.result);
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function buildCards(results: ScraperResult[]) {
    const valid = results
      .filter((r) => r.price !== null && r.price > 0)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

    if (valid.length === 0) return;

    const bestPrice = valid[0].price ?? 0;
    const cards: PriceCard[] = valid.map((r, i) => ({
      platform: r.platform,
      title: r.name,
      price: r.price ?? 0,
      priceFormatted: `₹${(r.price ?? 0).toLocaleString("en-IN")}`,
      meta:
        i === 0
          ? "Best price found"
          : `₹${((r.price ?? 0) - bestPrice).toLocaleString("en-IN")} more`,
      best: i === 0,
    }));

    setPrices(cards);
  }

  // Derive recommendation text from real AI data
  const recommendation =
    aiAnalysis?.recommendation ??
    geminiAnalysis?.priceAnalysis?.recommendation ??
    null;

  const priceInsight =
    aiAnalysis?.priceInsight ??
    geminiAnalysis?.priceAnalysis?.priceInsight ??
    null;

  const shouldBuy =
    aiAnalysis?.shouldBuy ??
    geminiAnalysis?.priceAnalysis?.shouldBuy ??
    null;

  const confidence =
    aiAnalysis?.confidence ??
    geminiAnalysis?.priceAnalysis?.confidence ??
    null;

  const dealScore = geminiAnalysis?.dealScore ?? null;
  const dealSummary = geminiAnalysis?.dealSummary?.summary ?? null;

  // Mini bar chart dimensions
  const chartW = 340;
  const barH = 18;
  const barGap = 6;
  const labelW = 80;
  const maxPrice = prices.length > 0 ? Math.max(...prices.map((p) => p.price)) : 1;

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader
          title="FineDeal"
          rightContent={
            <span className="text-xs font-medium text-success">
              {prices.length} results
            </span>
          }
        />

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <svg className="w-8 h-8 text-accent animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
              <p className="text-sm text-text-secondary">Loading results...</p>
            </div>
          ) : prices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-secondary text-sm">No price results found.</p>
              <Link
                href="/extension"
                className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-text-on-accent"
              >
                Try another search
              </Link>
            </div>
          ) : (
            <>
              {/* AI Deal Analysis Box */}
              <div className="rounded-lg border border-accent/40 bg-accent-tint p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-accent">AI Deal Analysis</p>
                  {dealScore !== null && (
                    <span className="text-xs font-bold text-accent">
                      {dealScore}/100
                    </span>
                  )}
                </div>

                {recommendation ? (
                  <p className="mt-2 text-sm text-text-primary leading-relaxed">
                    {recommendation}
                  </p>
                ) : dealSummary ? (
                  <p className="mt-2 text-sm text-text-primary leading-relaxed">
                    {dealSummary}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-text-secondary italic">
                    AI analysis unavailable
                  </p>
                )}

                {priceInsight && (
                  <p className="mt-2 text-xs text-text-secondary">{priceInsight}</p>
                )}

                {(confidence !== null || shouldBuy !== null) && (
                  <div className="mt-3 flex items-center justify-between">
                    {confidence !== null && (
                      <p className="text-xs text-text-secondary">
                        Confidence: {confidence}%
                      </p>
                    )}
                    {shouldBuy !== null && (
                      <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-text-on-accent">
                        {shouldBuy ? "BUY NOW" : "WAIT"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Price Comparison Cards */}
              <div>
                <p className="text-sm font-semibold text-text-primary mb-2">
                  Price Comparison ({prices.length} results)
                </p>
                <div className="space-y-2">
                  {prices.map((item) => (
                    <div
                      key={item.platform}
                      className={`rounded-lg border p-3 ${
                        item.best
                          ? "border-success bg-success-tint"
                          : "border-border bg-bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              item.best ? "bg-success" : "bg-text-tertiary"
                            }`}
                          />
                          <p className="text-sm font-semibold text-text-primary">
                            {item.platform}
                          </p>
                        </div>
                        {item.best && (
                          <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded">
                            BEST PRICE
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-text-secondary ml-4 truncate">
                        {item.title}
                      </p>
                      <div className="mt-2 flex items-center justify-between ml-4">
                        <p className="text-sm font-bold text-text-primary">
                          {item.priceFormatted}
                        </p>
                        <p
                          className={`text-xs ${
                            item.best
                              ? "text-success font-semibold"
                              : "text-text-secondary"
                          }`}
                        >
                          {item.meta}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini Price Comparison Bar Chart */}
              <div className="rounded-lg border border-border bg-bg-card p-3">
                <p className="text-xs font-semibold text-text-primary mb-2">
                  Price Overview
                </p>
                <svg
                  viewBox={`0 0 ${chartW} ${prices.length * (barH + barGap) + barGap}`}
                  className="w-full"
                  style={{
                    height: `${prices.length * (barH + barGap) + barGap}px`,
                  }}
                >
                  {prices.map((item, i) => {
                    const y = barGap + i * (barH + barGap);
                    const barMax = chartW - labelW - 60;
                    const w = maxPrice > 0 ? (item.price / maxPrice) * barMax : 0;
                    return (
                      <g key={item.platform}>
                        <text
                          x={0}
                          y={y + barH / 2 + 4}
                          className="text-text-secondary"
                          fill="currentColor"
                          fontSize="10"
                        >
                          {item.platform.length > 10
                            ? item.platform.substring(0, 10) + "..."
                            : item.platform}
                        </text>
                        <rect
                          x={labelW}
                          y={y}
                          width={w}
                          height={barH}
                          rx={4}
                          fill={item.best ? "#22C55E" : "#F97316"}
                          opacity={item.best ? 1 : 0.7}
                        />
                        <text
                          x={labelW + w + 6}
                          y={y + barH / 2 + 4}
                          className="text-text-primary"
                          fill="currentColor"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {item.priceFormatted}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Link
                  href="/extension/price-history"
                  className="flex-1 rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-primary text-center hover:bg-bg-input transition-colors"
                >
                  Price History
                </Link>
                <Link
                  href="/extension/alert-setup"
                  className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-text-on-accent text-center"
                >
                  Set Alert
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
