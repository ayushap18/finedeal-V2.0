import { NextRequest } from "next/server";
import { corsJson, handleOptions } from "@/lib/api-helpers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getBotToken(): string {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (t.startsWith("TELEGRAM_BOT_TOKEN=")) {
        return t.substring("TELEGRAM_BOT_TOKEN=".length);
      }
    }
  }
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = getBotToken();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// POST - Telegram webhook handler
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;
    if (!message?.text || !message?.chat?.id) {
      return corsJson({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const firstName = message.chat.first_name || "there";

    if (text === "/start") {
      await sendTelegramMessage(chatId,
        `👋 <b>Welcome to FineDeal Bot, ${firstName}!</b>\n\n` +
        `I'll send you price drop alerts for products you're tracking.\n\n` +
        `📋 <b>Your Chat ID:</b> <code>${chatId}</code>\n\n` +
        `To set up alerts:\n` +
        `1. Copy your Chat ID above\n` +
        `2. Open the FineDeal extension\n` +
        `3. Go to Settings → Telegram Chat ID\n` +
        `4. Paste your Chat ID and save\n\n` +
        `Commands:\n` +
        `/start - Welcome message\n` +
        `/id - Get your Chat ID\n` +
        `/status - Check bot status\n` +
        `/help - Show all commands`
      );
    } else if (text === "/id") {
      await sendTelegramMessage(chatId,
        `📋 Your Chat ID: <code>${chatId}</code>\n\nPaste this in the FineDeal extension settings.`
      );
    } else if (text === "/status") {
      await sendTelegramMessage(chatId,
        `✅ <b>FineDeal Bot Status</b>\n\n` +
        `Bot: Online\n` +
        `Your Chat ID: <code>${chatId}</code>\n` +
        `Notifications: Ready\n\n` +
        `If you've set up your Chat ID in the extension, you'll receive price drop alerts here.`
      );
    } else if (text === "/help") {
      await sendTelegramMessage(chatId,
        `📖 <b>FineDeal Bot Commands</b>\n\n` +
        `/start - Welcome & setup instructions\n` +
        `/id - Get your Chat ID\n` +
        `/status - Check bot status\n` +
        `/help - Show this message\n\n` +
        `💡 To receive price alerts, add your Chat ID (<code>${chatId}</code>) in the FineDeal extension settings.`
      );
    } else {
      await sendTelegramMessage(chatId,
        `I received your message! I'm a notification bot - I'll send you price alerts when products you're tracking drop in price.\n\n` +
        `Use /help to see available commands.`
      );
    }

    return corsJson({ ok: true });
  } catch {
    return corsJson({ ok: true });
  }
}

// GET - Setup webhook or get bot info
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const token = getBotToken();

  if (!token) {
    return corsJson({ error: "Bot token not configured" });
  }

  if (action === "setup") {
    // Set webhook to this endpoint
    const baseUrl = req.nextUrl.searchParams.get("url") || req.headers.get("host");
    const protocol = baseUrl?.includes("localhost") ? "http" : "https";
    const webhookUrl = `${protocol}://${baseUrl}/api/telegram`;

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json();
    return corsJson({ webhook: webhookUrl, result: data });
  }

  if (action === "remove") {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const data = await res.json();
    return corsJson({ result: data });
  }

  // Default: get bot info
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const info = await infoRes.json();

  const webhookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const webhook = await webhookRes.json();

  // Get recent updates (for polling mode)
  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
  const updates = await updatesRes.json();

  const recentChats = (updates.result || [])
    .filter((u: { message?: { chat?: { id: number } } }) => u.message?.chat?.id)
    .map((u: { message: { chat: { id: number; first_name?: string; username?: string } } }) => ({
      chatId: u.message.chat.id,
      name: u.message.chat.first_name || "Unknown",
      username: u.message.chat.username || "",
    }));

  return corsJson({
    bot: info.result,
    webhook: webhook.result,
    recentChats,
    instructions: "Send /start to @finedeal_bot on Telegram to get your Chat ID",
  });
}

export async function OPTIONS() {
  return handleOptions();
}
