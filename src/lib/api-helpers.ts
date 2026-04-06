import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

/** Return the CORS origin to use for a given request.
 *  If ALLOWED_ORIGINS is set (comma-separated list), reflect the requesting
 *  origin only if it appears in that list.  Otherwise fall back to "*".
 */
export function getAllowedOrigin(req?: NextRequest): string {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return "*";

  const allowed = raw.split(",").map((o) => o.trim()).filter(Boolean);
  if (allowed.length === 0) return "*";

  const origin = req?.headers.get("origin") ?? "";
  if (origin && allowed.includes(origin)) return origin;

  // Return the first allowed origin as a safe default (not "*")
  return allowed[0];
}

function buildCorsHeaders(req?: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function corsJson(data: unknown, status = 200, req?: NextRequest) {
  return NextResponse.json(data, { status, headers: buildCorsHeaders(req) });
}

export function corsError(message: string, status = 400, req?: NextRequest) {
  return NextResponse.json(
    { error: message },
    { status, headers: buildCorsHeaders(req) }
  );
}

export function handleOptions(req?: NextRequest) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(req) });
}

// ---------------------------------------------------------------------------
// Search-param helpers
// ---------------------------------------------------------------------------

export function parseSearchParams(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

/** Parse ?page and ?limit from search params.
 *  Defaults: page=1, limit=20.  Maximum limit capped at 100.
 */
export function parsePagination(req: NextRequest): { page: number; limit: number } {
  const params = req.nextUrl.searchParams;

  const rawPage = parseInt(params.get("page") ?? "1", 10);
  const rawLimit = parseInt(params.get("limit") ?? "20", 10);

  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

  return { page, limit };
}
