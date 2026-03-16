import { corsJson, handleOptions } from "@/lib/api-helpers";
import { registerUser } from "@/lib/users";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getBotToken(): string {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (t.startsWith("TELEGRAM_BOT_TOKEN=")) return t.substring("TELEGRAM_BOT_TOKEN=".length);
    }
  }
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

let lastUpdateId = 0;

async function sendMessage(chatId: number | string, text: string) {
  const token = getBotToken();
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function GET() {
  const token = getBotToken();
  if (!token) return corsJson({ error: "No bot token" });

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=10&timeout=1`);
    const data = await res.json();
    const processed: string[] = [];

    if (data.ok && data.result?.length > 0) {
      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg?.text || !msg?.chat?.id) continue;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const firstName = msg.chat.first_name || "there";
        const username = msg.chat.username || "";

        // Register user
        registerUser({
          telegram_chat_id: String(chatId),
          telegram_username: username,
        });

        if (text === "/start") {
          await sendMessage(chatId,
            `\u{1F44B} <b>Welcome to FineDeal, ${firstName}!</b>\n\n` +
            `I'll send you price drop alerts for products you're tracking.\n\n` +
            `\u{1F4CB} <b>Your Chat ID:</b> <code>${chatId}</code>\n\n` +
            `<b>Setup:</b>\n` +
            `1. Copy your Chat ID above\n` +
            `2. Open FineDeal extension \u2192 Settings\n` +
            `3. Paste Chat ID \u2192 Save\n\n` +
            `<b>Commands:</b>\n/id - Your Chat ID\n/status - Bot status\n/help - All commands`
          );
          processed.push(`Replied to /start from ${firstName}`);
        } else if (text === "/id") {
          await sendMessage(chatId, `\u{1F4CB} Your Chat ID: <code>${chatId}</code>`);
          processed.push(`Sent ID to ${firstName}`);
        } else if (text === "/status") {
          await sendMessage(chatId,
            `\u2705 <b>FineDeal Bot Active</b>\n\nChat ID: <code>${chatId}</code>\nAlerts: Ready\n\nYou'll receive price drop notifications here.`
          );
          processed.push(`Sent status to ${firstName}`);
        } else if (text === "/help") {
          await sendMessage(chatId,
            `\u{1F4D6} <b>Commands</b>\n\n/start - Welcome\n/id - Your Chat ID\n/status - Bot status\n/search <product> - Search prices across 9 sites\n/help - This message\n\n\u{1F4A1} Chat ID: <code>${chatId}</code>`
          );
          processed.push(`Sent help to ${firstName}`);
        } else if (text.startsWith("/search ")) {
        const searchQuery = text.substring(8).trim();
        if (!searchQuery) {
          await sendMessage(chatId, "Usage: /search <product name>\nExample: /search iPhone 16 Pro");
        } else {
          await sendMessage(chatId, `🔍 Searching for "<b>${searchQuery}</b>" across 9 sites...\nThis may take 10-15 seconds.`);

          try {
            const searchRes = await fetch(`http://localhost:3000/api/scraper`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: searchQuery, platforms: ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"] }),
            });
            const searchData = await searchRes.json();

            const priceLines = (searchData.results || [])
              .filter((r: { price: number | null }) => r.price)
              .sort((a: { price: number }, b: { price: number }) => a.price - b.price)
              .map((r: { platform: string; price: number }, i: number) =>
                `${i === 0 ? "🏆" : "💰"} <b>${r.platform}</b>: ₹${r.price.toLocaleString("en-IN")}${i === 0 ? " ← BEST" : ""}`
              );

            const failedLines = (searchData.results || [])
              .filter((r: { price: number | null }) => !r.price)
              .map((r: { platform: string }) => `❌ ${r.platform}`);

            const found = priceLines.length;
            const total = (searchData.results || []).length;

            let resultMsg = `📊 <b>Results for "${searchQuery}"</b>\n⏱ ${((searchData.duration_ms || 0) / 1000).toFixed(1)}s\n\n`;

            if (found > 0) {
              resultMsg += priceLines.join("\n") + "\n";
            }
            if (failedLines.length > 0) {
              resultMsg += "\n" + failedLines.join("\n") + "\n";
            }
            resultMsg += `\n${found}/${total} sites found prices`;

            await sendMessage(chatId, resultMsg);
          } catch {
            await sendMessage(chatId, "❌ Search failed. Please try again.");
          }
          processed.push(`Searched "${searchQuery}" for ${firstName}`);
        }
        } else {
          await sendMessage(chatId, `Got it! Use /help for commands.\n\nYour Chat ID: <code>${chatId}</code>`);
          processed.push(`Replied to ${firstName}`);
        }
      }
    }

    return corsJson({ ok: true, processed, lastUpdateId });
  } catch (e) {
    return corsJson({ error: e instanceof Error ? e.message : "Poll failed" });
  }
}

export async function OPTIONS() {
  return handleOptions();
}
