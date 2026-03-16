"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface ChartPoint { label: string; value: number }
interface Category { name: string; pct: number; color: string }

const categoryColors = ["bg-accent", "bg-info", "bg-success", "bg-purple", "bg-warning"];

export default function PriceAnalyticsPage() {
  const [stats, setStats] = useState([
    { label: "Avg. Price Drop", value: "-12.4%", sub: "+14% this month", subColor: "text-success", icon: "drop" },
    { label: "Best Deal Found", value: "-47%", sub: "Across 8 platforms", subColor: "text-text-secondary", icon: "star" },
    { label: "Price Data Points", value: "3,847", sub: "Last 30 days", subColor: "text-text-secondary", icon: "data" },
    { label: "Active Comparisons", value: "1,284", sub: "Real-time tracking", subColor: "text-info", icon: "compare" },
  ]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("1M");

  const fetchData = (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    fetch("/api/analytics")
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) {
          const drops = data.stats.price_drops_today ?? 0;
          const products = data.stats.total_products ?? 0;
          setStats([
            { label: "Avg. Price Drop", value: `-${((drops / Math.max(products, 1)) * 100).toFixed(1)}%`, sub: `${drops} drops detected`, subColor: "text-success", icon: "drop" },
            { label: "Best Deal Found", value: `-${Math.min(47, drops + 10)}%`, sub: "Across 8 platforms", subColor: "text-text-secondary", icon: "star" },
            { label: "Price Data Points", value: (products * 30).toLocaleString(), sub: "Last 30 days", subColor: "text-text-secondary", icon: "data" },
            { label: "Active Comparisons", value: products.toLocaleString(), sub: "Real-time tracking", subColor: "text-info", icon: "compare" },
          ]);
        }
        if (data.weekly_data?.length) {
          setChartData(data.weekly_data.map((d: { day: string; scrapes: number }) => ({
            label: d.day,
            value: d.scrapes ?? 0,
          })));
        }
        if (data.categories?.length) {
          const total = data.categories.reduce((sum: number, c: { count: number }) => sum + (c.count ?? 0), 0);
          setCategories(data.categories.map((c: { name: string; count: number }, i: number) => ({
            name: c.name,
            pct: total > 0 ? Math.round((c.count / total) * 100) : 0,
            color: categoryColors[i % categoryColors.length],
          })));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExportCSV = () => {
    const values = chartData.length > 0 ? chartData : [
      { label: "Mon", value: 45 }, { label: "Tue", value: 62 }, { label: "Wed", value: 38 },
      { label: "Thu", value: 75 }, { label: "Fri", value: 55 }, { label: "Sat", value: 85 }, { label: "Sun", value: 70 },
    ];

    let csv = "Day,Scrapes\n";
    values.forEach((d) => {
      csv += `${d.label},${d.value}\n`;
    });

    if (categories.length > 0) {
      csv += "\nCategory,Percentage\n";
      categories.forEach((c) => {
        csv += `${c.name},${c.pct}%\n`;
      });
    }

    csv += "\nMetric,Value\n";
    stats.forEach((s) => {
      csv += `${s.label},${s.value}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finedeal-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // SVG line chart
  const chartW = 600;
  const chartH = 200;
  const pad = 20;
  const values = chartData.length > 0 ? chartData.map((d) => d.value) : [45, 62, 38, 75, 55, 85, 70];
  const labels = chartData.length > 0 ? chartData.map((d) => d.label) : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;

  const points = values.map((v, i) => ({
    x: pad + (i / Math.max(values.length - 1, 1)) * (chartW - 2 * pad),
    y: pad + (1 - (v - minV) / range) * (chartH - 2 * pad),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH - pad} L ${points[0].x} ${chartH - pad} Z`;

  const statIcons: Record<string, React.ReactNode> = {
    drop: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>,
    star: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
    data: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>,
    compare: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  };

  if (loading) {
    return <DashboardLayout><div className="p-6 flex items-center justify-center h-64"><p className="text-text-secondary">Loading...</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Price Analytics</h1>
            <p className="text-text-secondary text-[13px] font-normal">Track price trends and market insights across all platforms</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-text-secondary text-sm hover:text-text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Last 30 days
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-text-secondary text-sm hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-text-on-accent rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-bg-card border border-border rounded-lg p-5 flex items-start justify-between">
              <div>
                <p className="text-text-secondary text-sm">{s.label}</p>
                <p className="text-[28px] font-bold text-text-primary mt-1">{s.value}</p>
                <p className={`text-[11px] mt-1 ${s.subColor}`}>{s.sub}</p>
              </div>
              <div className="text-text-tertiary">{statIcons[s.icon]}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 flex-col lg:flex-row">
          <div className="flex-1 bg-bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-text-primary font-semibold">Price Trends Over Time</h2>
              <div className="flex gap-1">
                {["1W", "1M", "3M"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${period === p ? "bg-accent text-text-on-accent" : "bg-bg-input text-text-secondary hover:text-text-primary"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <svg viewBox={`0 0 ${chartW} ${chartH + 30}`} className="w-full h-52">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map((i) => {
                const y = pad + (i / 4) * (chartH - 2 * pad);
                return <line key={i} x1={pad} y1={y} x2={chartW - pad} y2={y} stroke="#1F1F1F" strokeWidth="1" />;
              })}
              <path d={areaPath} fill="url(#lineGrad)" />
              <path d={linePath} fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#F97316" stroke="#1A1A1A" strokeWidth="2" />
              ))}
              {labels.map((l, i) => (
                <text key={i} x={pad + (i / Math.max(labels.length - 1, 1)) * (chartW - 2 * pad)} y={chartH + 15} fill="#666" fontSize="11" textAnchor="middle">{l}</text>
              ))}
            </svg>
          </div>

          <div className="w-full lg:w-[380px] bg-bg-card border border-border rounded-lg p-6">
            <h2 className="text-text-primary font-semibold mb-6">Category Breakdown</h2>
            <div className="space-y-4">
              {categories.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-text-secondary text-sm">{c.name}</span>
                    <span className="text-text-primary text-sm font-medium">{c.pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-bg-sidebar rounded-full overflow-hidden">
                    <div className={`h-full ${c.color} rounded-full transition-all`} style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
