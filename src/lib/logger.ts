import { create } from "@/lib/db";

type LogLevel = "debug" | "info" | "warning" | "error" | "success";

interface LogEntry {
  level: LogLevel;
  message: string;
  source: string;
  details?: unknown;
  timestamp?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  success: 1,
};

function getMinLevel(): number {
  const env = process.env.LOG_LEVEL || "info";
  return LOG_LEVELS[env as LogLevel] ?? 1;
}

function log(entry: LogEntry): void {
  const level = entry.level;
  const minLevel = getMinLevel();
  if (LOG_LEVELS[level] < minLevel) return;

  const timestamp = entry.timestamp || new Date().toISOString();
  const details =
    typeof entry.details === "string"
      ? entry.details
      : JSON.stringify(entry.details ?? "");

  // Console output (structured JSON in production, readable in dev)
  if (process.env.NODE_ENV === "production") {
    console.log(
      JSON.stringify({
        timestamp,
        level,
        source: entry.source,
        message: entry.message,
        details: entry.details,
      })
    );
  } else {
    const prefix =
      { debug: "🔍", info: "ℹ️", warning: "⚠️", error: "❌", success: "✅" }[
        level
      ] || "•";
    console.log(`${prefix} [${entry.source}] ${entry.message}`);
  }

  // Write to DB — wrapped in try-catch since DB may not be ready on first use
  try {
    create("system_logs", {
      level,
      message: entry.message,
      source: entry.source,
      details,
    });
  } catch {
    // DB not ready yet, skip
  }
}

// Convenience methods
export const logger = {
  debug: (source: string, message: string, details?: unknown) =>
    log({ level: "debug", message, source, details }),
  info: (source: string, message: string, details?: unknown) =>
    log({ level: "info", message, source, details }),
  warn: (source: string, message: string, details?: unknown) =>
    log({ level: "warning", message, source, details }),
  error: (source: string, message: string, details?: unknown) =>
    log({ level: "error", message, source, details }),
  success: (source: string, message: string, details?: unknown) =>
    log({ level: "success", message, source, details }),
};
