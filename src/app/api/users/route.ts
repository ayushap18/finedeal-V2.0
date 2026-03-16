import { NextRequest } from "next/server";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { getAllUsers, registerUser, getUserStats } from "@/lib/users";

export async function GET() {
  try {
    const users = getAllUsers();
    const stats = getUserStats();
    return corsJson({ users, stats });
  } catch (e) {
    return corsError("Failed to fetch users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = registerUser({
      email: body.email,
      telegram_chat_id: body.telegram_chat_id,
      telegram_username: body.telegram_username,
      browser: body.browser,
      extension_version: body.extension_version,
    });
    return corsJson({ user, message: "User registered" });
  } catch (e) {
    return corsError("Failed to register user", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
