import { NextResponse } from "next/server";
import { getDb } from "@/lib/sqlite-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { status: "ok" | "error"; latency_ms?: number; error?: string }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    checks.database = { status: "ok", latency_ms: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      latency_ms: Date.now() - dbStart,
      error: err instanceof Error ? err.message : "Unknown DB error"
    };
  }

  // Memory usage
  const mem = process.memoryUsage();
  const memoryMb = {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
  };

  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      version: process.env.npm_package_version || "unknown",
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks,
      memory_mb: memoryMb,
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
