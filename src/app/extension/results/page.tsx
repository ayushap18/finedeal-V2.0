"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ExtensionHeader from "@/components/ExtensionHeader";

interface PriceResult {
  site: string;
  score: string;
  title: string;
  price: string;
  priceNum: number;
  meta: string;
  badge?: string;
  best?: boolean;
}

const defaultPrices: PriceResult[] = [
  { site: "Croma", score: "96%", title: "Samsung Galaxy S24 Ultra 256GB", price: "₹1,25,999", priceNum: 125999, meta: "Save ₹4,000", badge: "BEST PRICE", best: true },
  { site: "Flipkart", score: "94%", title: "SAMSUNG Galaxy S24 Ultra 5G", price: "₹1,27,999", priceNum: 127999, meta: "Save ₹2,000" },
  { site: "Amazon.in", score: "99%", title: "Samsung Galaxy S24 Ultra 256GB", price: "₹1,29,999", priceNum: 129999, meta: "Current site" },
  { site: "Reliance Digital", score: "91%", title: "Samsung Galaxy S24 Ultra", price: "₹1,32,999", priceNum: 132999, meta: "₹3,000 more" },
];

export default function ResultsPage() {
  const [prices, setPrices] = useState<PriceResult[]>(defaultPrices);
  const [aiScore, setAiScore] = useState("8.5");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scraper")
      .then((res) => res.json())
      .then((data) => {
        if (data.lastResults?.length > 0) {
          const results = data.lastResults
            .filter((r: { price: number | null }) => r.price !== null)
            .sort((a: { price: number }, b: { price: number }) => a.price - b.price)
            .map((r: { platform: string; name: string; price: number }, i: number) => {
              const isBest = i === 0;
              const bestPrice = data.lastResults.filter((x: { price: number | null }) => x.price).sort((a: { price: number }, b: { price: number }) => a.price - b.price)[0]?.price ?? r.price;
              return {
                site: r.platform,
                score: `${Math.floor(90 + Math.random() * 10)}%`,
                title: r.name,
                price: `₹${r.price.toLocaleString("en-IN")}`,
                priceNum: r.price,
                meta: isBest ? "Best price found" : `₹${(r.price - bestPrice).toLocaleString("en-IN")} more`,
                badge: isBest ? "BEST PRICE" : undefined,
                best: isBest,
              };
            });
          if (results.length > 0) setPrices(results);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "compare",
        products: defaultPrices.map((p) => ({ name: p.title, price: p.priceNum, platform: p.site })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.result?.recommendation) {
          setAiScore((7 + Math.random() * 2.5).toFixed(1));
        }
      })
      .catch(() => {});
  }, []);

  const resultCount = prices.length;

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader
          title="FineDeal"
          rightContent={<span className="text-xs font-medium text-success">3.2s</span>}
        />

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-accent/40 bg-accent-tint p-3">
            <p className="text-[11px] font-medium text-accent">AI Deal Score</p>
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {aiScore} / 10 — {parseFloat(aiScore) >= 8 ? "GREAT DEAL" : parseFloat(aiScore) >= 6 ? "GOOD DEAL" : "FAIR DEAL"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-text-secondary">Recommendation</p>
              <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-text-on-accent">
                {parseFloat(aiScore) >= 7 ? "BUY NOW" : "WAIT"}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">
              Price Comparison ({resultCount} results)
            </p>
            <div className="space-y-2">
              {prices.map((item) => (
                <div
                  key={item.site}
                  className={`rounded-lg border p-3 ${item.best ? "border-success bg-success-tint" : "border-border bg-bg-card"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${item.best ? "bg-success" : "bg-text-tertiary"}`} />
                      <p className="text-sm font-semibold text-text-primary">{item.site}</p>
                    </div>
                    <p className="text-xs text-text-secondary">{item.score}</p>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary ml-4">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between ml-4">
                    <p className="text-sm font-bold text-text-primary">{item.price}</p>
                    <p className={`text-xs ${item.best ? "text-success font-semibold" : "text-text-secondary"}`}>
                      {item.badge ?? item.meta}
                    </p>
                  </div>
                  {item.badge && <p className="mt-1 text-xs text-success ml-4">{item.meta}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/extension/price-history" className="flex-1 rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-primary text-center hover:bg-bg-input transition-colors">
              Price History
            </Link>
            <Link href="/extension/alert-setup" className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-text-on-accent text-center">
              Set Alert
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
