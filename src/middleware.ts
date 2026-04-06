import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter (per IP, resets every 60 seconds)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Protected paths that require authentication
const PROTECTED_PATHS = [
  "/api/settings",
  "/api/auth",
  "/api/logs",
  "/api/import",
  "/api/pretrain",
];

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;

  return false;
}

function buildCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const corsHeaders = buildCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...corsHeaders,
      },
    });
  }

  // Rate limiting
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }

  // Auth check for protected paths
  if (isProtected(pathname)) {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse(
        JSON.stringify({ error: "Authorization header with Bearer token required" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    const token = authHeader.slice(7).trim();

    // Validate against ADMIN_KEY env var (bootstrap key, no DB needed in edge runtime)
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && token === adminKey) {
      // Valid bootstrap key — pass through with CORS headers
      const res = NextResponse.next();
      Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    // For DB-based keys: pass through to route handlers (better-sqlite3 not available in edge)
    // Route handlers will validate the token against the DB.
    // We only block requests with NO auth header here.
  }

  // Pass through — attach CORS headers
  const res = NextResponse.next();
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
