"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ExtensionHeader from "@/components/ExtensionHeader";

interface ProductData {
  id: string;
  name: string;
  category: string;
  platform: string;
  current_price: number;
  lowest_price: number;
  original_price: number;
  highest_price: number;
  url: string;
  image_url: string;
}

const SUPPORTED_SITES = [
  { name: "Amazon", color: "bg-accent" },
  { name: "Flipkart", color: "bg-blue" },
  { name: "Croma", color: "bg-green" },
  { name: "Myntra", color: "bg-pink" },
  { name: "Snapdeal", color: "bg-red" },
  { name: "Tata CLiQ", color: "bg-purple" },
  { name: "AJIO", color: "bg-yellow" },
  { name: "Nykaa", color: "bg-pink" },
  { name: "Vijay Sales", color: "bg-info" },
];

export default function ProductDetectedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ProductDetectedInner />
    </Suspense>
  );
}

function ProductDetectedInner() {
  const searchParams = useSearchParams();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertOn, setAlertOn] = useState(true);

  useEffect(() => {
    const productId = searchParams.get("id");
    const productUrl = searchParams.get("url");

    if (productId) {
      fetch(`/api/products/${productId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.product) setProduct(data.product);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (productUrl) {
      // Try to scrape the URL
      fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: productUrl }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.results?.[0]?.price) {
            const r = data.results[0];
            setProduct({
              id: "",
              name: r.name,
              category: "Product",
              platform: r.platform,
              current_price: r.price,
              lowest_price: r.price,
              original_price: r.price,
              highest_price: r.price,
              url: r.url,
              image_url: "",
            });
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      // No specific product - try to show first tracked product
      fetch("/api/products")
        .then((res) => res.json())
        .then((data) => {
          if (data.products?.length > 0) {
            setProduct(data.products[0]);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
          <ExtensionHeader title="FineDeal" rightContent={<span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">v4.0</span>} />
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-text-secondary text-sm mt-4">Detecting product...</p>
          </div>
        </div>
      </div>
    );
  }

  // No product detected - show empty state with supported sites
  if (!product) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
          <ExtensionHeader title="FineDeal" rightContent={<span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">v4.0</span>} />
          <div className="p-5 space-y-5">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-text-primary font-semibold text-lg">No Product Detected</h2>
              <p className="text-text-secondary text-sm mt-2">
                Visit a product page on any supported site to start comparing prices.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Supported Sites</p>
              <div className="grid grid-cols-3 gap-2">
                {SUPPORTED_SITES.map((site) => (
                  <div key={site.name} className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2.5">
                    <span className={`h-2 w-2 rounded-full ${site.color}`} />
                    <span className="text-text-primary text-xs font-medium">{site.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg-card p-3">
              <p className="text-xs font-semibold text-text-primary mb-2">Quick Search</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).elements.namedItem("url") as HTMLInputElement;
                if (input.value) {
                  window.location.href = `/extension/product-detected?url=${encodeURIComponent(input.value)}`;
                }
              }}>
                <div className="flex gap-2">
                  <input
                    name="url"
                    type="text"
                    placeholder="Paste product URL..."
                    className="flex-1 bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent"
                  />
                  <button type="submit" className="rounded-md bg-accent px-3 py-2 text-text-on-accent">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="border-t border-border px-5 py-3 text-center text-[11px] text-text-tertiary">
            Powered by AI · 9 Sites · v4.0
          </div>
        </div>
      </div>
    );
  }

  // Product detected - show full details
  const avg = Math.round((product.lowest_price + product.highest_price) / 2);

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader
          title="FineDeal"
          rightContent={<span className="rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent">v4.0</span>}
        />

        <div className="space-y-5 p-5">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-success" />
            Product detected on {product.platform}
          </div>

          <div className="flex gap-4 rounded-lg border border-border bg-bg-card p-4">
            <div className="h-20 w-20 rounded-md bg-bg-input border border-border flex items-center justify-center shrink-0">
              <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-text-primary text-sm font-medium leading-snug">{product.name}</p>
              <p className="text-text-secondary text-xs">{product.platform} · {product.category}</p>
            </div>
          </div>

          <div className="flex items-end justify-between">
            <p className="text-text-secondary text-xs">Current Price</p>
            <p className="text-2xl font-bold text-text-primary">₹{product.current_price.toLocaleString("en-IN")}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Lowest Ever", value: `₹${product.lowest_price.toLocaleString("en-IN")}` },
              { label: "Average", value: `₹${avg.toLocaleString("en-IN")}` },
              { label: "Sites Found", value: "9" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-bg-card p-3 text-center">
                <p className="text-[10px] text-text-secondary">{stat.label}</p>
                <p className="mt-1 text-xs font-semibold text-text-primary">{stat.value}</p>
              </div>
            ))}
          </div>

          <Link
            href="/extension/searching"
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-on-accent flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Compare Prices Across 9 Sites
          </Link>

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-sm text-text-primary">Set Price Drop Alert</p>
            </div>
            <button onClick={() => setAlertOn(!alertOn)} className={`h-6 w-11 rounded-full p-1 transition-colors ${alertOn ? "bg-success" : "bg-border"}`}>
              <div className={`h-4 w-4 rounded-full bg-bg-page transition-transform ${alertOn ? "ml-auto" : ""}`} />
            </button>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 text-center text-[11px] text-text-tertiary">
          Powered by AI · 9 Sites · v4.0
        </div>
      </div>
    </div>
  );
}
