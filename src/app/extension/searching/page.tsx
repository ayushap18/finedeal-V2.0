"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ExtensionHeader from "@/components/ExtensionHeader";

const ALL_SITES = [
  "Amazon", "Flipkart", "Croma", "Myntra",
  "Snapdeal", "Tata CLiQ", "AJIO", "Nykaa", "Vijay Sales",
];

const PLATFORM_KEYS = [
  "amazon", "flipkart", "croma", "myntra",
  "snapdeal", "tatacliq", "ajio", "nykaa", "vijaysales",
];

type SiteTone = "success" | "info" | "muted" | "error";
type SiteState = { name: string; state: string; tone: SiteTone };

type Phase = "scraping" | "validating" | "analyzing" | "telegram" | "done";

const PHASE_LABELS: Record<Phase, string> = {
  scraping: "Scraping prices...",
  validating: "AI Validating...",
  analyzing: "Gemini Analysis...",
  telegram: "Sending to Telegram...",
  done: "Complete!",
};

function phaseProgress(phase: Phase, sub: number): number {
  switch (phase) {
    case "scraping": return Math.round(sub * 50);
    case "validating": return 50 + Math.round(sub * 20);
    case "analyzing": return 70 + Math.round(sub * 20);
    case "telegram": return 90 + Math.round(sub * 10);
    case "done": return 100;
  }
}

export default function SearchingPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteState[]>(
    ALL_SITES.map((name) => ({ name, state: "Waiting...", tone: "muted" as const }))
  );
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("scraping");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") || "Samsung Galaxy S24 Ultra";

    // --- Phase 1: Scraping (0-50%) ---
    setPhase("scraping");

    // Animate site statuses while the real request is in flight
    const animInterval = setInterval(() => {
      setSites((prev) => {
        const firstWaiting = prev.findIndex((s) => s.tone === "muted");
        if (firstWaiting === -1) return prev;
        return prev.map((s, i) =>
          i === firstWaiting ? { ...s, state: "Searching...", tone: "info" as const } : s
        );
      });
    }, 350);

    let scraperData: {
      results?: Array<{
        platform: string;
        name: string;
        price: number | null;
        url?: string;
        error?: string;
      }>;
      gemini_analysis?: {
        dealSummary?: { summary: string };
        priceAnalysis?: {
          bestDeal: { platform: string; price: number; name: string };
          recommendation: string;
          confidence: number;
          priceInsight: string;
          shouldBuy: boolean;
        };
        dealScore?: number;
      };
      duration_ms?: number;
    };

    try {
      // Animate progress while waiting
      let scrapeProgress = 0;
      const progressInterval = setInterval(() => {
        scrapeProgress = Math.min(scrapeProgress + 0.04, 0.9);
        setProgress(phaseProgress("scraping", scrapeProgress));
      }, 300);

      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, platforms: PLATFORM_KEYS }),
      });

      clearInterval(progressInterval);
      clearInterval(animInterval);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Scraper returned ${res.status}`);
      }

      scraperData = await res.json();
      setProgress(phaseProgress("scraping", 1));

      // Update site statuses from real results
      const resultMap = new Map<string, boolean>();
      for (const r of scraperData.results ?? []) {
        resultMap.set((r.platform || "").toLowerCase(), r.price !== null && r.price > 0);
      }

      setSites((prev) =>
        prev.map((s) => {
          const key = s.name.toLowerCase().replace(/\s/g, "").replace(".in", "");
          const matched = Array.from(resultMap.entries()).find(
            ([k]) => k.includes(key) || key.includes(k)
          );
          if (matched) {
            return matched[1]
              ? { ...s, state: "Found!", tone: "success" as const }
              : { ...s, state: "No price", tone: "error" as const };
          }
          return { ...s, state: "No results", tone: "muted" as const };
        })
      );
    } catch (e) {
      clearInterval(animInterval);
      setError(e instanceof Error ? e.message : "Scraping failed");
      setSites((prev) => prev.map((s) => ({ ...s, state: "Failed", tone: "error" as const })));
      return;
    }

    const validResults = (scraperData.results ?? []).filter(
      (r) => r.price !== null && r.price > 0
    );

    // --- Phase 2: AI Validation (50-70%) ---
    // The scraper API already runs Groq validation internally, so we just show the phase
    setPhase("validating");
    setProgress(phaseProgress("validating", 0));
    await new Promise((r) => setTimeout(r, 600));
    setProgress(phaseProgress("validating", 0.5));
    await new Promise((r) => setTimeout(r, 400));
    setProgress(phaseProgress("validating", 1));

    // --- Phase 3: Gemini Analysis (70-90%) ---
    setPhase("analyzing");
    setProgress(phaseProgress("analyzing", 0));

    let aiAnalysis: {
      recommendation?: string;
      bestDeal?: { platform: string; price: number; name: string };
      confidence?: number;
      priceInsight?: string;
      shouldBuy?: boolean;
    } | null = null;

    if (validResults.length >= 1) {
      try {
        const aiRes = await fetch("/api/ai", {
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
        });
        setProgress(phaseProgress("analyzing", 0.7));
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiAnalysis = aiData.result ?? null;
        }
      } catch {
        // AI analysis is best-effort
      }
    }
    setProgress(phaseProgress("analyzing", 1));

    // --- Phase 4: Telegram notification (90-100%) ---
    setPhase("telegram");
    setProgress(phaseProgress("telegram", 0));

    try {
      const bestResult = validResults[0];
      const priceLines = validResults
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
        .map(
          (r, i) =>
            `${i === 0 ? "🏆" : "  •"} ${r.platform}: ₹${(r.price ?? 0).toLocaleString("en-IN")}${i === 0 ? " (BEST)" : ""}`
        );

      let msg = `🔍 Search: ${query}\n`;
      msg += `📊 ${validResults.length} prices found\n\n`;
      msg += `💰 Prices:\n${priceLines.join("\n")}\n`;
      if (aiAnalysis?.recommendation) {
        msg += `\n🤖 AI: ${aiAnalysis.recommendation}\n`;
      }
      if (bestResult) {
        msg += `\n✅ Best: ${bestResult.platform} at ₹${(bestResult.price ?? 0).toLocaleString("en-IN")}`;
      }

      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "telegram",
          chat_id: "8295267041",
          message: msg,
        }),
      });
    } catch {
      // Telegram is best-effort
    }

    setProgress(phaseProgress("telegram", 1));

    // --- Store in sessionStorage and navigate ---
    setPhase("done");
    setProgress(100);

    try {
      sessionStorage.setItem(
        "finedeal_results",
        JSON.stringify({
          query,
          results: scraperData.results,
          aiAnalysis,
          geminiAnalysis: scraperData.gemini_analysis,
          timestamp: Date.now(),
        })
      );
    } catch {}

    setTimeout(() => {
      router.push("/extension/results");
    }, 1000);
  }, [router]);

  useEffect(() => {
    run();
  }, [run]);

  const toneClass = (tone: SiteTone) => {
    switch (tone) {
      case "success": return "text-success text-xs font-medium";
      case "info": return "text-info text-xs font-medium";
      case "error": return "text-red-500 text-xs font-medium";
      default: return "text-text-tertiary text-xs";
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader
          title="FineDeal"
          rightContent={
            <span className="text-xs font-medium text-accent">
              {PHASE_LABELS[phase]}
            </span>
          }
        />

        <div className="space-y-4 p-5">
          {/* Header */}
          <div className="flex flex-col items-center gap-3">
            {phase === "done" ? (
              <svg className="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-accent animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <div className="text-center">
              <h1 className="text-text-primary text-lg font-semibold">
                {error ? "Search failed" : phase === "done" ? "Search complete!" : PHASE_LABELS[phase]}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                {error
                  ? error
                  : phase === "done"
                  ? "Redirecting to results..."
                  : "Finding the best price for you"}
              </p>
            </div>
          </div>

          {/* Multi-phase progress bar */}
          <div>
            <div className="h-2 w-full rounded-full bg-bg-card border border-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-text-tertiary">
              <span className={phase === "scraping" ? "text-accent font-medium" : ""}>Scrape</span>
              <span className={phase === "validating" ? "text-accent font-medium" : ""}>Validate</span>
              <span className={phase === "analyzing" ? "text-accent font-medium" : ""}>Analyze</span>
              <span className={phase === "telegram" ? "text-accent font-medium" : ""}>Notify</span>
            </div>
          </div>

          {/* Site list */}
          <div className="rounded-lg border border-border bg-bg-card p-3 space-y-0">
            {sites.map((site, i) => (
              <div key={site.name}>
                <div className="flex items-center justify-between text-sm py-2">
                  <p className="text-text-primary">{site.name}</p>
                  <p className={toneClass(site.tone)}>{site.state}</p>
                </div>
                {i < sites.length - 1 && <div className="border-b border-border" />}
              </div>
            ))}
          </div>

          {/* Error retry */}
          {error && (
            <button
              onClick={() => {
                setError(null);
                setProgress(0);
                setPhase("scraping");
                setSites(ALL_SITES.map((name) => ({ name, state: "Waiting...", tone: "muted" as const })));
                run();
              }}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-on-accent"
            >
              Retry Search
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
