import { corsJson, handleOptions } from "@/lib/api-helpers";
import { getAll, getSettings } from "@/lib/db";
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

export async function GET() {
  const token = getBotToken();
  if (!token) return corsJson({ error: "No bot token" });

  try {
    const settings = getSettings();
    const products = getAll("products");
    const alerts = getAll("alerts");
    const logs = getAll("system_logs");

    // Find products with recent price drops
    const priceDrops = products
      .filter(p => {
        const current = Number(p.current_price) || 0;
        const original = Number(p.original_price) || current;
        return current > 0 && current < original * 0.9;
      })
      .sort((a, b) => {
        const discA = 1 - (Number(a.current_price) / Number(a.original_price));
        const discB = 1 - (Number(b.current_price) / Number(b.original_price));
        return discB - discA;
      })
      .slice(0, 5);

    const activeAlerts = alerts.filter(a => a.status === "active").length;
    const recentErrors = logs.filter(l => l.level === "error").length;

    let msg = `📊 FineDeal Daily Digest\n\n`;
    msg += `📦 ${products.length} products tracked\n`;
    msg += `🔔 ${activeAlerts} active alerts\n`;
    msg += `${recentErrors > 0 ? "⚠️" : "✅"} ${recentErrors} errors in logs\n\n`;

    if (priceDrops.length > 0) {
      msg += `🔥 Top Price Drops:\n`;
      for (const p of priceDrops) {
        const current = Number(p.current_price);
        const original = Number(p.original_price);
        const discount = Math.round((1 - current / original) * 100);
        msg += `  ${discount}% off: ${String(p.name).substring(0, 30)} - ₹${current.toLocaleString("en-IN")}\n`;
      }
    } else {
      msg += `No significant price drops today.\n`;
    }

    msg += `\nUse /search <product> to check prices!`;

    // Send to admin
    const adminChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
    if (adminChatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: adminChatId, text: msg }),
      });
    }

    // Send to all registered users with telegram
    const { getAllUsers } = await import("@/lib/users");
    const users = getAllUsers();
    let sent = 0;
    for (const user of users) {
      if (user.telegram_chat_id && user.telegram_chat_id !== adminChatId) {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: user.telegram_chat_id, text: msg }),
          });
          sent++;
        } catch { /* skip failed sends */ }
      }
    }

    return corsJson({ message: "Daily digest sent", admin: !!adminChatId, users_notified: sent });
  } catch (e) {
    return corsJson({ error: e instanceof Error ? e.message : "Failed" });
  }
}

export async function OPTIONS() {
  return handleOptions();
}
