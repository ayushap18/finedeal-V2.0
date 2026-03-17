"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WeeklyEntry {
  day: string;
  scrapes: number;
  price_drops: number;
}
interface CategoryEntry {
  name: string;
  count: number;
}
interface TrendingEntry {
  id: string;
  name: string;
  platform: string;
  current_price: number;
  original_price: number;
  drop_percentage: number;
}
interface StatsData {
  total_products: number;
  active_alerts: number;
  price_drops_today: number;
  ai_accuracy: number;
}
interface Product {
  id: string;
  name: string;
  platform: string;
  current_price: number;
  original_price: number;
  lowest_price: number;
  highest_price: number;
  category: string;
  last_checked: string;
}
interface PriceHistoryEntry {
  price: number;
  recorded_at: string;
  currency: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_COLORS = {
  primary: "#F97316",
  blue: "#3B82F6",
  green: "#22C55E",
  purple: "#A855F7",
  yellow: "#EAB308",
};
const PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.purple,
  CHART_COLORS.yellow,
];
const GRID_STROKE = "#1F1F1F";
const CATEGORY_BG = [
  "bg-accent",
  "bg-info",
  "bg-success",
  "bg-[#A855F7]",
  "bg-warning",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

function bucketLabel(b: number): string {
  return ["Under \u20B910K", "\u20B910K\u2013\u20B950K", "\u20B950K\u2013\u20B91L", "Over \u20B91L"][b] ?? "";
}

function priceBucket(price: number): number {
  if (price < 10000) return 0;
  if (price < 50000) return 1;
  if (price < 100000) return 2;
  return 3;
}

/** Build a smooth cubic bezier path through a set of points */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const tension = 0.3;
    const cp1x = p1.x + ((p2.x - p0.x) * tension);
    const cp1y = p1.y + ((p2.y - p0.y) * tension);
    const cp2x = p2.x - ((p3.x - p1.x) * tension);
    const cp2y = p2.y - ((p3.y - p1.y) * tension);
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PriceAnalyticsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyEntry[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryEntry[]>([]);
  const [trending, setTrending] = useState<TrendingEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"1W" | "1M" | "3M">("1M");
  const [_priceHistory, setPriceHistory] = useState<Record<string, PriceHistoryEntry[]>>({});

  /* ---------- Fetch helpers ---------- */

  const fetchPriceHistory = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      const data = await res.json();
      if (data.price_history) {
        setPriceHistory((prev) => ({ ...prev, [productId]: data.price_history }));
      }
    } catch {
      /* silently ignore */
    }
  }, []);

  const fetchAll = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      try {
        const [analyticsRes, productsRes] = await Promise.all([
          fetch("/api/analytics"),
          fetch("/api/products"),
        ]);
        const analytics = await analyticsRes.json();
        const prodData = await productsRes.json();

        if (analytics.stats) setStats(analytics.stats);
        if (analytics.weekly_data) setWeeklyData(analytics.weekly_data);
        if (analytics.category_breakdown) setCategoryBreakdown(analytics.category_breakdown);
        if (analytics.trending) setTrending(analytics.trending);
        if (prodData.products) {
          setProducts(prodData.products);
          // Fetch price history for top trending products
          const trendingIds = (analytics.trending || []).slice(0, 3).map((t: TrendingEntry) => t.id);
          trendingIds.forEach((id: string) => fetchPriceHistory(id));
        }
      } catch {
        /* silently ignore */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPriceHistory]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ---------- Derived data ---------- */

  // Apply period filter to weekly data
  const filteredWeeklyData = (() => {
    if (period === "1W") return weeklyData.slice(-7);
    if (period === "3M") return weeklyData;
    return weeklyData; // 1M default
  })();

  // Price range buckets
  const priceRanges = [0, 0, 0, 0];
  products.forEach((p) => {
    priceRanges[priceBucket(p.current_price)]++;
  });

  // Category breakdown with percentage
  const catTotal = categoryBreakdown.reduce((s, c) => s + c.count, 0);
  const categories = categoryBreakdown.map((c, i) => ({
    name: c.name,
    count: c.count,
    pct: catTotal > 0 ? Math.round((c.count / catTotal) * 100) : 0,
    color: CATEGORY_BG[i % CATEGORY_BG.length],
  }));

  /* ---------- Export CSV ---------- */

  const handleExportCSV = () => {
    let csv = "Day,Scrapes,Price Drops\n";
    filteredWeeklyData.forEach((d) => {
      csv += `${d.day},${d.scrapes},${d.price_drops}\n`;
    });

    csv += "\nCategory,Count,Percentage\n";
    categories.forEach((c) => {
      csv += `${c.name},${c.count},${c.pct}%\n`;
    });

    csv += "\nMetric,Value\n";
    if (stats) {
      csv += `Total Products,${stats.total_products}\n`;
      csv += `Active Alerts,${stats.active_alerts}\n`;
      csv += `Price Drops Today,${stats.price_drops_today}\n`;
      csv += `AI Accuracy,${stats.ai_accuracy}%\n`;
    }

    csv += "\nPrice Range,Count\n";
    priceRanges.forEach((c, i) => {
      csv += `${bucketLabel(i)},${c}\n`;
    });

    csv += "\nTop Deal,Platform,Current Price,Drop %\n";
    trending.forEach((t) => {
      csv += `"${t.name}",${t.platform},${t.current_price},${t.drop_percentage}%\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finedeal-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- Stat card config ---------- */

  const statCards = stats
    ? [
        {
          label: "Total Products",
          value: stats.total_products.toLocaleString(),
          sub: "Tracked across platforms",
          subColor: "text-text-secondary",
          iconColor: "text-accent",
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          ),
        },
        {
          label: "Active Alerts",
          value: stats.active_alerts.toLocaleString(),
          sub: "Monitoring prices",
          subColor: "text-warning",
          iconColor: "text-warning",
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          ),
        },
        {
          label: "Price Drops Today",
          value: stats.price_drops_today.toLocaleString(),
          sub: `${stats.total_products > 0 ? ((stats.price_drops_today / stats.total_products) * 100).toFixed(0) : 0}% of products`,
          subColor: "text-success",
          iconColor: "text-success",
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          ),
        },
        {
          label: "AI Accuracy",
          value: `${stats.ai_accuracy}%`,
          sub: "Prediction confidence",
          subColor: "text-info",
          iconColor: "text-info",
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          ),
        },
      ]
    : [];

  /* ================================================================== */
  /*  SVG Chart Renderers                                               */
  /* ================================================================== */

  /* --- Chart 1: Scrape Activity Vertical Bar Chart --- */
  const renderScrapeBarChart = () => {
    const W = 600, H = 260, padL = 50, padR = 20, padT = 20, padB = 44;
    const data = filteredWeeklyData;
    if (!data.length) return null;

    const maxV = Math.max(...data.map((d) => d.scrapes), 1);
    const ceilMax = Math.ceil(maxV / 10) * 10;
    const barW = Math.min(44, (W - padL - padR) / data.length - 10);
    const gridLines = 5;
    const chartH = H - padT - padB;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity="1" />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity="0.6" />
          </linearGradient>
          <filter id="barGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (i / gridLines) * chartH;
          const val = Math.round(ceilMax - (i / gridLines) * ceilMax);
          return (
            <g key={`grid-${i}`}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID_STROKE} strokeWidth="1" />
              <text x={padL - 10} y={y + 4} fill="#555" fontSize="10" textAnchor="end" fontFamily="monospace">
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = padL + (i + 0.5) * ((W - padL - padR) / data.length);
          const x = cx - barW / 2;
          const barH = (d.scrapes / ceilMax) * chartH;
          const y = H - padB - barH;
          return (
            <g key={`bar-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={5}
                ry={5}
                fill="url(#barGrad)"
                filter="url(#barGlow)"
              >
                <title>{`${d.day}: ${d.scrapes} scrapes`}</title>
              </rect>
              {/* Value label */}
              <text x={cx} y={y - 8} fill="#ddd" fontSize="10" textAnchor="middle" fontWeight="600">
                {d.scrapes}
              </text>
              {/* Day label */}
              <text x={cx} y={H - padB + 18} fill="#777" fontSize="11" textAnchor="middle">
                {d.day}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#333" strokeWidth="1" />
      </svg>
    );
  };

  /* --- Chart 2: Price Drops Line + Area Chart --- */
  const renderPriceDropsLineChart = () => {
    const W = 600, H = 260, padL = 50, padR = 20, padT = 20, padB = 44;
    const data = filteredWeeklyData;
    if (!data.length) return null;

    const vals = data.map((d) => d.price_drops);
    const maxV = Math.max(...vals, 1);
    const ceilMax = Math.ceil(maxV / 5) * 5;
    const chartH = H - padT - padB;
    const chartW = W - padL - padR;
    const gridLines = 5;

    const pts = vals.map((v, i) => ({
      x: padL + (i / Math.max(vals.length - 1, 1)) * chartW,
      y: padT + (1 - v / ceilMax) * chartH,
    }));

    const curvePath = smoothPath(pts);
    const areaPath = `${curvePath} L${pts[pts.length - 1].x},${H - padB} L${pts[0].x},${H - padB} Z`;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity="0.35" />
            <stop offset="70%" stopColor={CHART_COLORS.blue} stopOpacity="0.08" />
            <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity="0" />
          </linearGradient>
          <filter id="lineGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (i / gridLines) * chartH;
          const val = Math.round(ceilMax - (i / gridLines) * ceilMax);
          return (
            <g key={`grid-${i}`}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID_STROKE} strokeWidth="1" />
              <text x={padL - 10} y={y + 4} fill="#555" fontSize="10" textAnchor="end" fontFamily="monospace">
                {val}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#lineAreaGrad)" />

        {/* Smooth line */}
        <path
          d={curvePath}
          fill="none"
          stroke={CHART_COLORS.blue}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#lineGlow)"
        />

        {/* Data points + labels */}
        {pts.map((p, i) => (
          <g key={`pt-${i}`}>
            {/* Outer ring */}
            <circle cx={p.x} cy={p.y} r="6" fill="none" stroke={CHART_COLORS.blue} strokeWidth="1.5" opacity="0.3" />
            {/* Filled dot */}
            <circle cx={p.x} cy={p.y} r="3.5" fill={CHART_COLORS.blue} stroke="#0a0a0a" strokeWidth="2">
              <title>{`${data[i].day}: ${data[i].price_drops} price drops`}</title>
            </circle>
            {/* Value above dot */}
            <text x={p.x} y={p.y - 12} fill="#9cc5ff" fontSize="9" textAnchor="middle" fontWeight="600">
              {data[i].price_drops}
            </text>
            {/* Day label */}
            <text x={p.x} y={H - padB + 18} fill="#777" fontSize="11" textAnchor="middle">
              {data[i].day}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#333" strokeWidth="1" />
      </svg>
    );
  };

  /* --- Chart 3: Platform Distribution Donut Chart --- */
  const renderDonutChart = () => {
    if (!categoryBreakdown.length) return null;
    const total = categoryBreakdown.reduce((s, c) => s + c.count, 0);
    if (total === 0) return null;

    const cx = 120, cy = 120, r = 85, strokeW = 30;
    const circumference = 2 * Math.PI * r;
    let accumulated = 0;

    const segments = categoryBreakdown.map((cat, i) => {
      const pct = cat.count / total;
      const dashLen = pct * circumference;
      const dashGap = circumference - dashLen;
      const offset = -accumulated * circumference + circumference * 0.25;
      accumulated += pct;
      return {
        ...cat,
        dashLen,
        dashGap,
        offset,
        color: PALETTE[i % PALETTE.length],
        pct,
      };
    });

    return (
      <div className="flex flex-col items-center gap-5">
        <svg viewBox="0 0 240 240" className="w-48 h-48">
          <defs>
            <filter id="donutShadow">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#000" floodOpacity="0.3" />
            </filter>
          </defs>
          {/* Track ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1a" strokeWidth={strokeW + 2} />
          {/* Segments */}
          {segments.map((seg, i) => (
            <circle
              key={`seg-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeW}
              strokeDasharray={`${seg.dashLen} ${seg.dashGap}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="butt"
              filter="url(#donutShadow)"
              className="transition-all duration-500"
            >
              <title>{`${seg.name}: ${seg.count} (${(seg.pct * 100).toFixed(0)}%)`}</title>
            </circle>
          ))}
          {/* Center text */}
          <text x={cx} y={cy - 8} fill="#fff" fontSize="26" fontWeight="bold" textAnchor="middle">
            {total}
          </text>
          <text x={cx} y={cy + 12} fill="#666" fontSize="11" textAnchor="middle">
            Total Items
          </text>
        </svg>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 w-full">
          {segments.map((seg, i) => (
            <div key={`legend-${i}`} className="flex items-center gap-2.5 text-sm">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/10"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-text-secondary truncate capitalize">{seg.name}</span>
              <span className="text-text-primary font-semibold ml-auto tabular-nums">{seg.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* --- Chart 4: Price Range Horizontal Bar Chart --- */
  const renderPriceRangeChart = () => {
    const maxV = Math.max(...priceRanges, 1);
    const W = 520, H = 200, padL = 115, padR = 55, barH = 28, gap = 14;
    const colors = [CHART_COLORS.green, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.yellow];
    const barArea = W - padL - padR;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {colors.map((color, i) => (
            <linearGradient key={`hbarGrad-${i}`} id={`hbarGrad${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.65" />
            </linearGradient>
          ))}
        </defs>
        {priceRanges.map((count, i) => {
          const y = 12 + i * (barH + gap);
          const bW = (count / maxV) * barArea;
          return (
            <g key={`range-${i}`}>
              {/* Label */}
              <text x={padL - 12} y={y + barH / 2 + 5} fill="#999" fontSize="12" textAnchor="end">
                {bucketLabel(i)}
              </text>
              {/* Background track */}
              <rect x={padL} y={y} width={barArea} height={barH} rx={6} fill="#141414" />
              {/* Filled bar */}
              <rect
                x={padL}
                y={y}
                width={Math.max(bW, 4)}
                height={barH}
                rx={6}
                fill={`url(#hbarGrad${i})`}
                className="transition-all duration-500"
              >
                <title>{`${bucketLabel(i)}: ${count} products`}</title>
              </rect>
              {/* Count */}
              <text
                x={padL + Math.max(bW, 4) + 10}
                y={y + barH / 2 + 5}
                fill="#ccc"
                fontSize="13"
                fontWeight="700"
                className="tabular-nums"
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  /* --- Chart 5: Top Deals Horizontal Bar Chart --- */
  const renderTopDealsChart = () => {
    const items = trending.slice(0, 6);
    if (!items.length) return null;
    const maxDrop = Math.max(...items.map((t) => t.drop_percentage), 1);
    const W = 620, barH = 26, gap = 14, padL = 200, padR = 65;
    const H = items.length * (barH + gap) + 16;
    const barArea = W - padL - padR;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="dealGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity="1" />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {items.map((t, i) => {
          const y = 8 + i * (barH + gap);
          const bW = (t.drop_percentage / maxDrop) * barArea;
          const label = t.name.length > 26 ? t.name.slice(0, 23) + "\u2026" : t.name;
          return (
            <g key={`deal-${i}`}>
              {/* Product name */}
              <text x={padL - 12} y={y + barH / 2 + 5} fill="#aaa" fontSize="11" textAnchor="end">
                {label}
              </text>
              {/* Background track */}
              <rect x={padL} y={y} width={barArea} height={barH} rx={5} fill="#141414" />
              {/* Filled bar */}
              <rect
                x={padL}
                y={y}
                width={Math.max(bW, 4)}
                height={barH}
                rx={5}
                fill="url(#dealGrad)"
                className="transition-all duration-500"
              >
                <title>{`${t.name} (${t.platform}): ${t.drop_percentage}% off \u2014 \u20B9${t.current_price.toLocaleString("en-IN")} (was \u20B9${t.original_price.toLocaleString("en-IN")})`}</title>
              </rect>
              {/* Percentage */}
              <text
                x={padL + Math.max(bW, 4) + 10}
                y={y + barH / 2 + 5}
                fill={CHART_COLORS.primary}
                fontSize="12"
                fontWeight="700"
                className="tabular-nums"
              >
                {t.drop_percentage}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  /* ================================================================== */
  /*  Render                                                            */
  /* ================================================================== */

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <svg className="w-10 h-10 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-text-secondary text-sm">Loading analytics data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-6 md:px-10 py-8 space-y-7 max-w-[1440px] mx-auto">
        {/* ---- Header ---- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Price Analytics</h1>
            <p className="text-text-secondary text-[13px] font-normal mt-0.5">
              Track price trends and market insights across all platforms
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period selector */}
            <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1">
              {(["1W", "1M", "3M"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                    period === p
                      ? "bg-accent text-white shadow-sm shadow-accent/20"
                      : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {/* Refresh */}
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border rounded-lg text-text-secondary text-sm hover:text-text-primary hover:border-border/80 transition-all duration-200 disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
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
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-all duration-200 shadow-sm shadow-accent/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* ---- Stat Cards ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-bg-card border border-border rounded-lg p-5 flex items-start justify-between hover:border-border/60 transition-colors duration-200"
            >
              <div>
                <p className="text-text-secondary text-sm">{s.label}</p>
                <p className="text-[28px] font-bold text-text-primary mt-1 tabular-nums">{s.value}</p>
                <p className={`text-[11px] mt-1 ${s.subColor}`}>{s.sub}</p>
              </div>
              <div className={`${s.iconColor} p-2 rounded-lg bg-white/5`}>{s.icon}</div>
            </div>
          ))}
        </div>

        {/* ---- Row 1: Scrape Activity + Price Drops ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Scrape Activity Bar Chart */}
          <div className="bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-text-primary font-semibold">Scrape Activity</h2>
                <p className="text-text-tertiary text-xs mt-0.5">Daily scrapes per day</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.primary }} />
                Scrapes
              </div>
            </div>
            {renderScrapeBarChart() ?? (
              <p className="text-text-tertiary text-sm text-center py-8">No scrape data available</p>
            )}
          </div>

          {/* Chart 2: Price Drops Line + Area */}
          <div className="bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-text-primary font-semibold">Price Drops Over Time</h2>
                <p className="text-text-tertiary text-xs mt-0.5">Number of drops per day</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.blue }} />
                Drops
              </div>
            </div>
            {renderPriceDropsLineChart() ?? (
              <p className="text-text-tertiary text-sm text-center py-8">No price drop data available</p>
            )}
          </div>
        </div>

        {/* ---- Row 2: Donut + Price Range ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 3: Platform Distribution Donut */}
          <div className="bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-text-primary font-semibold">Platform Distribution</h2>
              <span className="text-text-tertiary text-xs">{catTotal} total</span>
            </div>
            {renderDonutChart() ?? (
              <p className="text-text-tertiary text-sm text-center py-8">No platform data available</p>
            )}
          </div>

          {/* Chart 4: Price Range Distribution */}
          <div className="bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-text-primary font-semibold">Price Range Distribution</h2>
                <p className="text-text-tertiary text-xs mt-0.5">Products grouped by current price</p>
              </div>
              <span className="text-text-tertiary text-xs tabular-nums">{products.length} products</span>
            </div>
            {renderPriceRangeChart()}
          </div>
        </div>

        {/* ---- Row 3: Top Deals + Category Breakdown ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Chart 5: Top Deals */}
          <div className="lg:col-span-3 bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-text-primary font-semibold">Top Deals</h2>
                <p className="text-text-tertiary text-xs mt-0.5">Biggest price drops right now</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.primary }} />
                Drop %
              </div>
            </div>
            {renderTopDealsChart() ?? (
              <p className="text-text-tertiary text-sm text-center py-8">No trending deals available</p>
            )}
          </div>

          {/* Category Breakdown with progress bars */}
          <div className="lg:col-span-2 bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-text-primary font-semibold">Category Breakdown</h2>
              <span className="text-text-tertiary text-xs">{categories.length} categories</span>
            </div>
            <div className="space-y-4">
              {categories.length > 0 ? (
                categories.map((c) => (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-text-secondary text-sm capitalize">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-text-tertiary text-xs tabular-nums">{c.count}</span>
                        <span className="text-text-primary text-sm font-medium tabular-nums w-10 text-right">
                          {c.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-bg-sidebar rounded-full overflow-hidden">
                      <div
                        className={`h-full ${c.color} rounded-full transition-all duration-700 ease-out`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-text-tertiary text-sm text-center py-4">No categories available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
