import { NextRequest } from "next/server";
import { getSettings, updateSettings } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";

function maskKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

export async function GET() {
  try {
    const settings = getSettings();
    return corsJson({
      settings: {
        ...settings,
        groq_key: maskKey(settings.groq_key),
        gemini_key: maskKey(settings.gemini_key),
        smtp_pass: maskKey(settings.smtp_pass),
        telegram_bot_token: maskKey(settings.telegram_bot_token),
      },
    });
  } catch (e) {
    return corsError("Failed to fetch settings", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = updateSettings(body);
    return corsJson({
      settings: {
        ...updated,
        groq_key: maskKey(updated.groq_key),
        gemini_key: maskKey(updated.gemini_key),
        smtp_pass: maskKey(updated.smtp_pass),
        telegram_bot_token: maskKey(updated.telegram_bot_token),
      },
      message: "Settings updated",
    });
  } catch (e) {
    return corsError("Failed to update settings", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
