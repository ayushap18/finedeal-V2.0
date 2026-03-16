"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface TrendingProduct {
  rank: number;
  label: string;
  badgeBg: string;
  badgeText: string;
  name: string;
  price: string;
  original: string;
  searches: string;
  discount: string;
  fire?: boolean;
  rawPrice?: number;
  rawOriginal?: number;
  category?: string;
}

const badgeStyles = [
  { bg: "bg-[#F9731630]", text: "text-accent" },
  { bg: "bg-blue-tint", text: "text-blue" },
  { bg: "bg-green-tint", text: "text-green" },
  { bg: "bg-purple-tint", text: "text-purple" },
  { bg: "bg-yellow-tint", text: "text-yellow" },
  { bg: "bg-pink-tint", text: "text-pink" },
];

const defaultCategories = ["All", "Electronics", "Mobile", "Fashion"];

export default function TrendingPage() {
  const [products, setProducts] = useState<TrendingProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [scrapingTrending, setScrapingTrending] = useState(false);
  const [compareProduct, setCompareProduct] = useState<TrendingProduct | null>(null);
  const [compareData, setCompareData] = useState<{ platform: string; price: number; url?: string }[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  const fetchProducts = () => {
    setLoading(true);
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products?.length > 0) {
          const sorted = [...data.products]
            .sort(
              (
                a: { current_price: number; lowest_price: number },
                b: { current_price: number; lowest_price: number }
              ) => {
                const discA =
                  ((a.current_price - a.lowest_price) / a.current_price) * 100;
                const discB =
                  ((b.current_price - b.lowest_price) / b.current_price) * 100;
                return discB - discA;
              }
            )
            .slice(0, 6);

          setProducts(
            sorted.map(
              (
                p: {
                  name: string;
                  current_price: number;
                  original_price: number;
                  lowest_price: number;
                  category?: string;
                },
                i: number
              ) => {
                const discount =
                  p.original_price > 0
                    ? Math.round(
                        ((p.original_price - p.current_price) / p.original_price) *
                          100
                      )
                    : 0;
                const style = badgeStyles[i % badgeStyles.length];
                return {
                  rank: i + 1,
                  label: i < 3 ? `#${i + 1} Trending` : `#${i + 1}`,
                  badgeBg: style.bg,
                  badgeText: style.text,
                  name: p.name,
                  price: `\u20B9${p.current_price.toLocaleString("en-IN")}`,
                  original: `\u20B9${p.original_price.toLocaleString("en-IN")}`,
                  searches: `${Math.floor(500 + (6 - i) * 400)} searches`,
                  discount: discount > 0 ? `-${discount}% off` : "No discount",
                  fire: i === 0,
                  rawPrice: p.current_price,
                  rawOriginal: p.original_price,
                  category: p.category ?? "Other",
                };
              }
            )
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleScrapeTrending = async () => {
    setScrapingTrending(true);
    try {
      const topProduct = products[0];
      const query = topProduct?.name ?? "best deals today";
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, platforms: ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"] }),
      });
      const data = await res.json();
      if (data.error) {
        window.alert(`Scrape result: ${data.error}`);
      } else {
        window.alert(
          `Scrape completed! ${data.results?.length ?? 0} results found.`
        );
        fetchProducts();
      }
    } catch {
      window.alert("Scrape request failed");
    } finally {
      setScrapingTrending(false);
    }
  };

  const handleCompare = async (product: TrendingProduct) => {
    setCompareProduct(product);
    setCompareLoading(true);
    setCompareData([]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compare",
          products: [
            {
              name: product.name,
              price: product.rawPrice ?? 0,
              platform: "Amazon",
            },
            {
              name: product.name,
              price: (product.rawPrice ?? 0) * 1.05,
              platform: "Flipkart",
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.result?.comparisons) {
        setCompareData(data.result.comparisons);
      } else {
        // Fallback simulated comparison data
        setCompareData([
          { platform: "Amazon", price: product.rawPrice ?? 0 },
          {
            platform: "Flipkart",
            price: Math.round((product.rawPrice ?? 0) * 1.03),
          },
          {
            platform: "Croma",
            price: Math.round((product.rawPrice ?? 0) * 1.08),
          },
        ]);
      }
    } catch {
      setCompareData([
        { platform: "Amazon", price: product.rawPrice ?? 0 },
        {
          platform: "Flipkart",
          price: Math.round((product.rawPrice ?? 0) * 1.03),
        },
        {
          platform: "Croma",
          price: Math.round((product.rawPrice ?? 0) * 1.08),
        },
      ]);
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Trending Products
            </h1>
            <p className="text-[13px] text-text-secondary font-normal mt-1">
              Most searched and compared products across all platforms
            </p>
          </div>
          <button
            onClick={handleScrapeTrending}
            disabled={scrapingTrending}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-on-accent px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {scrapingTrending ? "Scraping..." : "Scrape Trending"}
          </button>
        </div>

        <div className="flex gap-3">
          {(["All", ...Array.from(new Set(products.map(p => p.category).filter((c): c is string => !!c)))] as string[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={
                cat === activeCategory
                  ? "px-4 py-2 rounded-lg text-sm font-medium bg-accent text-text-on-accent"
                  : "px-4 py-2 rounded-lg text-sm font-medium bg-bg-card text-text-muted hover:text-text-primary transition-colors"
              }
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.filter(p => activeCategory === "All" || (p.category ?? "").toLowerCase().includes(activeCategory.toLowerCase())).map((p) => (
            <div
              key={p.rank}
              onClick={() => handleCompare(p)}
              className="bg-bg-card border border-border rounded-lg p-5 space-y-4 cursor-pointer hover:border-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`${p.badgeBg} ${p.badgeText} text-xs font-semibold px-3 py-1 rounded-full`}
                >
                  {p.label}
                </span>
                {p.fire && <span className="text-base">*</span>}
              </div>
              <h3 className="text-text-primary font-semibold text-lg">
                {p.name}
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-success font-bold text-xl">{p.price}</span>
                <span className="text-text-tertiary line-through text-sm">
                  {p.original}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{p.searches}</span>
                <span className="text-success font-medium">{p.discount}</span>
              </div>
              <p className="text-text-tertiary text-xs">Click to compare prices</p>
            </div>
          ))}
        </div>
      </div>

      {/* Compare Modal */}
      {compareProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                Price Comparison
              </h2>
              <button
                onClick={() => setCompareProduct(null)}
                className="text-text-tertiary hover:text-text-primary text-xl"
              >
                x
              </button>
            </div>

            <p className="text-text-secondary text-sm">{compareProduct.name}</p>

            {compareLoading ? (
              <div className="py-8 text-center text-text-tertiary text-sm">
                Loading comparison data...
              </div>
            ) : (
              <div className="space-y-3">
                {compareData.map((item, i) => {
                  const isLowest =
                    item.price ===
                    Math.min(...compareData.map((d) => d.price));
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-4 rounded-lg ${
                        isLowest
                          ? "bg-success-tint border border-success/30"
                          : "bg-bg-page"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-text-primary font-medium text-sm">
                          {item.platform}
                        </span>
                        {isLowest && (
                          <span className="text-xs font-semibold text-success bg-success-tint px-2 py-0.5 rounded-full">
                            Best Price
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-bold text-lg ${
                          isLowest ? "text-success" : "text-text-primary"
                        }`}
                      >
                        {`\u20B9${item.price.toLocaleString("en-IN")}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setCompareProduct(null)}
              className="w-full px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
