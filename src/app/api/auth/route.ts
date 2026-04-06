import { NextRequest } from "next/server";
import {
  corsJson,
  corsError,
  handleOptions,
} from "@/lib/api-helpers";
import {
  validateApiKey,
  listApiKeys,
  createApiKey,
  deleteApiKey,
} from "@/lib/auth";

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

function isAuthorized(req: NextRequest): boolean {
  const token = extractBearerToken(req);
  if (!token) return false;

  // Allow ADMIN_KEY env var as bootstrap key
  if (process.env.ADMIN_KEY && token === process.env.ADMIN_KEY) return true;

  const result = validateApiKey(token);
  return result.valid;
}

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return corsError("Unauthorized", 401);
  }

  try {
    const keys = listApiKeys();
    return corsJson({ keys });
  } catch {
    return corsError("Failed to list API keys", 500);
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return corsError("Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const { name, role } = body as { name?: string; role?: string };

    if (!name || typeof name !== "string" || name.trim() === "") {
      return corsError("name is required", 400);
    }

    const { key, id } = createApiKey(name.trim(), role ?? "admin");
    return corsJson({ key, id, message: "API key created. Store this key safely — it won't be shown again." }, 201);
  } catch {
    return corsError("Failed to create API key", 500);
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return corsError("Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id || typeof id !== "string" || id.trim() === "") {
      return corsError("id is required", 400);
    }

    const deleted = deleteApiKey(id.trim());
    if (!deleted) {
      return corsError("API key not found", 404);
    }

    return corsJson({ message: "API key deleted" });
  } catch {
    return corsError("Failed to delete API key", 500);
  }
}
