"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";
type FilterTab = "All" | "Info" | "Success" | "Warning" | "Error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string;
}

const defaultLogs: LogEntry[] = [
  { timestamp: "15:42:33", level: "INFO", message: "[Scraper] Successfully scraped Amazon.in - 847 products updated", source: "Scraper" },
  { timestamp: "15:42:10", level: "SUCCESS", message: "[API] Groq classification completed - 142 products categorized", source: "API" },
  { timestamp: "15:41:55", level: "WARN", message: "[Scraper] Flipkart rate limit reached - retrying in 30s", source: "Scraper" },
  { timestamp: "15:41:22", level: "INFO", message: "[Alert] Price drop: Samsung S24 Ultra now \u20B989,999 on Croma", source: "Alert" },
  { timestamp: "15:40:48", level: "ERROR", message: "[Scraper] Tata CLiQ connection timeout - skipping batch", source: "Scraper" },
  { timestamp: "15:40:15", level: "INFO", message: "[Email] Notification sent to user@example.com - 3 price drops", source: "Email" },
  { timestamp: "15:39:30", level: "SUCCESS", message: "[Telegram] Bot message delivered to 12 subscribers", source: "Telegram" },
  { timestamp: "15:38:44", level: "INFO", message: "[DB] PostgreSQL backup completed - 2.4GB snapshot saved", source: "DB" },
  { timestamp: "15:37:12", level: "WARN", message: "[API] Gemini API response slow - 4.2s latency", source: "API" },
  { timestamp: "15:36:05", level: "SUCCESS", message: "[Matcher] Smart Matcher v4.0 processed 324 comparisons", source: "Matcher" },
];

interface ApiLog {
  id: string;
  level: string;
  message: string;
  source: string;
  timestamp: string;
  metadata: unknown;
}

const levelStyles: Record<LogLevel, { bg: string; text: string }> = {
  INFO: { bg: "bg-blue-tint", text: "text-blue" },
  SUCCESS: { bg: "bg-green-tint", text: "text-green" },
  WARN: { bg: "bg-yellow-tint", text: "text-yellow" },
  ERROR: { bg: "bg-red-tint", text: "text-red" },
};

const filterTabs: { label: FilterTab; levels: LogLevel[] }[] = [
  { label: "All", levels: ["INFO", "SUCCESS", "WARN", "ERROR"] },
  { label: "Info", levels: ["INFO"] },
  { label: "Success", levels: ["SUCCESS"] },
  { label: "Warning", levels: ["WARN"] },
  { label: "Error", levels: ["ERROR"] },
];

const filterTabStyles: Record<FilterTab, { activeBg: string; activeText: string }> = {
  All: { activeBg: "bg-accent", activeText: "text-text-primary" },
  Info: { activeBg: "bg-bg-card", activeText: "text-blue" },
  Success: { activeBg: "bg-bg-card", activeText: "text-green" },
  Warning: { activeBg: "bg-bg-card", activeText: "text-yellow" },
  Error: { activeBg: "bg-bg-card", activeText: "text-red" },
};

function extractSource(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1] : "System";
}

export default function SystemLogsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [logs, setLogs] = useState<LogEntry[]>(defaultLogs);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const filterToLevel: Record<FilterTab, string> = {
    All: "all",
    Info: "INFO",
    Success: "SUCCESS",
    Warning: "WARN",
    Error: "ERROR",
  };

  const fetchLogs = useCallback(
    (filter: FilterTab) => {
      setLoading(true);
      const level = filterToLevel[filter];
      const url = level === "all" ? "/api/logs" : `/api/logs?level=${level}`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data.logs) {
            setLogs(
              data.logs.map((l: ApiLog) => ({
                timestamp: l.timestamp
                  ? new Date(l.timestamp).toLocaleTimeString("en-US", { hour12: false })
                  : "--:--:--",
                level: (l.level?.toUpperCase() ?? "INFO") as LogLevel,
                message: l.message ?? "",
                source: l.source ?? extractSource(l.message ?? ""),
              }))
            );
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchLogs(activeFilter);
  }, [activeFilter, fetchLogs]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchLogs(activeFilter);
      }, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, activeFilter, fetchLogs]);

  const handleClearLogs = () => {
    fetch("/api/logs", { method: "DELETE" })
      .then(() => {
        setLogs([]);
      })
      .catch(() => window.alert("Failed to clear logs"));
  };

  const handleExportLogs = () => {
    const text = filtered
      .map((log) => `[${log.timestamp}] [${log.level}] [${log.source}] ${log.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finedeal-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = logs
    .filter((log) => filterTabs.find((t) => t.label === activeFilter)!.levels.includes(log.level))
    .filter((log) => !searchText || log.message.toLowerCase().includes(searchText.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="flex flex-col h-screen px-10 py-8 gap-4">
        {/* Top Bar */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">System Logs</h1>
            <p className="text-sm text-text-muted mt-1">
              Monitor scraping activity, API calls, and system events
              <span className="ml-3 text-text-tertiary">
                ({filtered.length} log{filtered.length !== 1 ? "s" : ""} shown)
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.label;
              const style = filterTabStyles[tab.label];
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveFilter(tab.label)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? `${style.activeBg} ${style.activeText}`
                      : "bg-bg-card text-text-muted hover:text-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            <button
              onClick={handleClearLogs}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-bg-card text-text-muted hover:text-text-primary transition-colors ml-2"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search logs..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-bg-input border border-border text-text-primary text-sm placeholder:text-text-tertiary outline-none focus:border-accent"
            />
          </div>

          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                autoRefresh ? "bg-accent" : "bg-bg-sidebar border border-border"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRefresh ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className="text-sm text-text-secondary">Auto-refresh (5s)</span>
          </label>

          {/* Export button */}
          <button
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>

        {/* Log Container */}
        <div className="flex-1 bg-bg-sidebar rounded-lg overflow-y-auto font-mono p-4">
          {filtered.length === 0 ? (
            <div className="text-text-tertiary text-sm text-center py-8">No logs found.</div>
          ) : (
            filtered.map((log, i) => {
              const style = levelStyles[log.level];
              const isError = log.level === "ERROR";
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] rounded"
                >
                  <span className="text-text-dim text-sm shrink-0">
                    {log.timestamp}
                  </span>
                  <span
                    className={`${style.bg} ${style.text} text-xs font-semibold px-2 py-0.5 rounded shrink-0 w-[68px] text-center`}
                  >
                    {log.level}
                  </span>
                  <span className="text-xs text-text-tertiary shrink-0 w-[70px] truncate" title={log.source}>
                    {log.source}
                  </span>
                  <span className={`text-sm ${isError ? "text-red" : "text-text-light"}`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
