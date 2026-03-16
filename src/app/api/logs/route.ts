import { NextRequest } from "next/server";
import { getAll, create, clearCollection } from "@/lib/db";
import { corsJson, corsError, handleOptions, parseSearchParams } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { level } = parseSearchParams(req);
    let logs = getAll("system_logs");

    if (level && level !== "all") {
      const normalizedLevel = level.toLowerCase();
      logs = logs.filter((l) => (l.level as string).toLowerCase() === normalizedLevel);
    }

    // Sort newest first
    logs.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());

    return corsJson({ logs, total: logs.length });
  } catch (e) {
    return corsError("Failed to fetch logs", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.level || !body.message) {
      return corsError("level and message are required");
    }
    const log = create("system_logs", {
      level: body.level,
      message: body.message,
      source: body.source || "api",
      details: body.details || "",
    });
    return corsJson({ log }, 201);
  } catch (e) {
    return corsError("Failed to create log", 500);
  }
}

export async function DELETE() {
  try {
    clearCollection("system_logs");
    return corsJson({ message: "All logs cleared" });
  } catch (e) {
    return corsError("Failed to clear logs", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
