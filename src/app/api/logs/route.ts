import { NextRequest } from "next/server";
import { getAll, getAllPaginated, create, clearCollection } from "@/lib/db";
import {
  corsJson,
  corsError,
  handleOptions,
  parseSearchParams,
  parsePagination,
} from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { level } = parseSearchParams(req);
    const { page, limit } = parsePagination(req);

    if (level && level !== "all") {
      // Level filter — fetch all matching rows, then paginate in memory
      const normalizedLevel = level.toLowerCase();
      const allLogs = getAll("system_logs").filter(
        (l) => (l.level as string).toLowerCase() === normalizedLevel
      );

      // getAll already returns DESC by created_at, but sort explicitly to be safe
      allLogs.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );

      const total = allLogs.length;
      const offset = (page - 1) * limit;
      const logs = allLogs.slice(offset, offset + limit);
      const totalPages = Math.ceil(total / limit) || 1;

      return corsJson({ logs, total, page, limit, totalPages }, 200, req);
    }

    // No level filter — use paginated DB query (sorted DESC by created_at)
    const result = getAllPaginated("system_logs", { page, limit });
    return corsJson(
      {
        logs: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      200,
      req
    );
  } catch {
    return corsError("Failed to fetch logs", 500, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.level || !body.message) {
      return corsError("level and message are required", 400, req);
    }
    const log = create("system_logs", {
      level: body.level,
      message: body.message,
      source: body.source || "api",
      details: body.details || "",
    });
    return corsJson({ log }, 201, req);
  } catch {
    return corsError("Failed to create log", 500, req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    clearCollection("system_logs");
    return corsJson({ message: "All logs cleared" }, 200, req);
  } catch {
    return corsError("Failed to clear logs", 500, req);
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}
