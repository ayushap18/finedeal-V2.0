"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ExtensionHeader from "@/components/ExtensionHeader";

const ALL_SITES = [
  "Amazon", "Flipkart", "Croma", "Myntra",
  "Snapdeal", "Tata CLiQ", "AJIO", "Nykaa", "Vijay Sales",
];

type SiteState = { name: string; state: string; tone: "success" | "info" | "muted" | "error" };

export default function SearchingPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteState[]>(
    ALL_SITES.map((name) => ({ name, state: "Waiting...", tone: "muted" as const }))
  );
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function runSearch() {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") || "Samsung Galaxy S24 Ultra";
      const platforms = ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"];

      for (let i = 0; i < ALL_SITES.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 400));
        setSites((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, state: "Searching...", tone: "info" as const } : s
          )
        );
        setProgress(Math.round(((i + 1) / ALL_SITES.length) * 60));
      }

      try {
        const res = await fetch("/api/scraper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, platforms }),
        });
        const data = await res.json();

        if (!cancelled && data.results) {
          const resultMap = new Map<string, number>();
          for (const r of data.results) {
            if (r.price) {
              const platName = r.platform || r.name;
              resultMap.set(platName.toLowerCase(), r.price);
            }
          }

          setSites((prev) =>
            prev.map((s) => {
              const key = s.name.toLowerCase().replace(".in", "").replace(" ", "");
              const matched = Array.from(resultMap.keys()).find((k) => k.includes(key) || key.includes(k));
              if (matched) {
                return { ...s, state: "Found!", tone: "success" as const };
              }
              return { ...s, state: "No results", tone: "muted" as const };
            })
          );
        }
      } catch {
        if (!cancelled) {
          setSites((prev) =>
            prev.map((s) => ({ ...s, state: "Search failed", tone: "error" as const }))
          );
        }
      }

      if (!cancelled) {
        setProgress(100);
        setDone(true);
        setTimeout(() => {
          if (!cancelled) router.push("/extension/results");
        }, 1500);
      }
    }

    runSearch();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader
          title="FineDeal"
          rightContent={<span className="text-xs font-medium text-accent">Searching...</span>}
        />

        <div className="space-y-4 p-5">
          <div className="flex flex-col items-center gap-3">
            <svg className="w-10 h-10 text-accent animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="text-center">
              <h1 className="text-text-primary text-lg font-semibold">
                {done ? "Search complete!" : "Searching 9 sites..."}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                {done ? "Redirecting to results..." : "Finding the best price for you"}
              </p>
            </div>
          </div>

          <div className="h-2 w-full rounded-full bg-bg-card border border-border">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="rounded-lg border border-border bg-bg-card p-3 space-y-0">
            {sites.map((site, i) => (
              <div key={site.name}>
                <div className="flex items-center justify-between text-sm py-2">
                  <p className="text-text-primary">{site.name}</p>
                  <p className={
                    site.tone === "success" ? "text-success text-xs font-medium"
                    : site.tone === "info" ? "text-info text-xs font-medium"
                    : site.tone === "error" ? "text-error text-xs font-medium"
                    : "text-text-tertiary text-xs"
                  }>
                    {site.state}
                  </p>
                </div>
                {i < sites.length - 1 && <div className="border-b border-border" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
