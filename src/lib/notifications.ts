import { create, getSettings } from "@/lib/db";
import { sendSmtpEmail } from "@/lib/smtp";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let _envCache: Record<string, string> | null = null;
function getEnvLocal(key: string): string {
  if (!_envCache) {
    _envCache = {};
    const envPath = join(process.cwd(), ".env.local");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("#")) {
          const eq = t.indexOf("=");
          if (eq > 0) _envCache[t.substring(0, eq)] = t.substring(eq + 1);
        }
      }
    }
  }
  return _envCache[key] || process.env[key] || "";
}

interface EmailResult {
  success: boolean;
  method: "smtp" | "db_log";
  id?: string;
  error?: string;
}

interface TelegramResult {
  success: boolean;
  method: "bot_api";
  error?: string;
}

/**
 * Send an email via SMTP relay (Brevo STARTTLS).
 * Falls back to DB logging if SMTP credentials are missing.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  try {
    const smtpUser = getEnvLocal("SMTP_USER");
    const smtpPass = getEnvLocal("SMTP_PASS");

    if (smtpUser && smtpPass) {
      const htmlContent = `<div style="font-family:sans-serif;padding:20px;background:#0F0F0F;color:#FAF8F5;">
        <h2 style="color:#F97316;">🔔 FineDeal Alert</h2>
        <div style="white-space:pre-line;">${body.replace(/<[^>]+>/g, "")}</div>
        <hr style="border-color:#1F1F1F;margin:20px 0;" />
        <p style="color:#888;font-size:12px;">Sent by FineDeal Price Tracker</p>
      </div>`;

      const result = await sendSmtpEmail(to, subject, htmlContent);

      if (result.success) {
        create("system_logs", {
          level: "success",
          message: `Email sent to ${to}: ${subject}`,
          source: "notifications",
          details: JSON.stringify({ messageId: result.messageId, to, subject }),
        });
        return { success: true, method: "smtp", id: result.messageId };
      } else {
        create("system_logs", {
          level: "error",
          message: `SMTP error: ${result.error}`,
          source: "notifications",
          details: JSON.stringify({ to, subject, error: result.error }),
        });
        return { success: false, method: "smtp", error: result.error };
      }
    }

    // Fallback: log to DB
    const logEntry = create("system_logs", {
      level: "info",
      message: `Email queued for ${to}: ${subject}`,
      source: "notifications",
      details: JSON.stringify({ to, subject, body, status: "pending", note: "SMTP credentials not configured" }),
    });
    return { success: true, method: "db_log", id: logEntry.id as string };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    create("system_logs", {
      level: "error",
      message: `Failed to send email to ${to}`,
      source: "notifications",
      details: errorMsg,
    });
    return { success: false, method: "db_log", error: errorMsg };
  }
}

/**
 * Send a Telegram message via the Bot API.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in env or DB settings.
 */
export async function sendTelegram(
  chatId: string,
  message: string
): Promise<TelegramResult> {
  try {
    const settings = getSettings();
    const token =
      getEnvLocal("TELEGRAM_BOT_TOKEN") || settings.telegram_bot_token;
    const targetChatId = (chatId && chatId.trim()) || getEnvLocal("TELEGRAM_CHAT_ID") || settings.telegram_chat_id || "";

    if (!targetChatId) {
      return { success: false, method: "bot_api", error: "No chat ID configured. Users need to message @finedeal_bot first and provide their chat ID in Settings." };
    }

    if (!token || token.includes("placeholder")) {
      create("system_logs", {
        level: "warning",
        message: "Telegram bot token not configured — message logged only",
        source: "notifications",
        details: JSON.stringify({ chat_id: targetChatId, text: message }),
      });
      return { success: false, method: "bot_api", error: "Bot token not configured" };
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const data = await res.json();

    if (!data.ok) {
      create("system_logs", {
        level: "error",
        message: `Telegram API error: ${data.description || "Unknown"}`,
        source: "notifications",
        details: JSON.stringify(data),
      });
      return { success: false, method: "bot_api", error: data.description || "Telegram API error" };
    }

    create("system_logs", {
      level: "success",
      message: `Telegram message sent to chat ${targetChatId}`,
      source: "notifications",
      details: `Message: ${message.slice(0, 100)}`,
    });

    return { success: true, method: "bot_api" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    create("system_logs", {
      level: "error",
      message: `Failed to send Telegram message: ${errorMsg}`,
      source: "notifications",
      details: errorMsg,
    });
    return { success: false, method: "bot_api", error: errorMsg };
  }
}

/**
 * Send notifications for a triggered alert based on its settings.
 */
export async function notify(
  alert: Record<string, unknown>,
  product: Record<string, unknown>
): Promise<{ email?: EmailResult; telegram?: TelegramResult }> {
  const settings = getSettings();
  const results: { email?: EmailResult; telegram?: TelegramResult } = {};

  if (!settings.notifications_enabled) {
    create("system_logs", {
      level: "info",
      message: "Notifications disabled globally — skipping",
      source: "notifications",
      details: `Alert: ${alert.id}, Product: ${product.name}`,
    });
    return results;
  }

  const subject = `🔔 FineDeal Alert: ${product.name}`;
  const body = buildAlertMessage(alert, product);

  if (alert.notify_email) {
    const to = (alert.user_email as string) || settings.user_email || settings.smtp_user || "user@finedeal.app";
    results.email = await sendEmail(to, subject, body);
  }

  if (alert.notify_telegram) {
    const chatId = (alert.telegram_chat_id as string) || process.env.TELEGRAM_CHAT_ID || settings.telegram_chat_id || "";
    const telegramMsg = buildAlertMessage(alert, product);
    results.telegram = await sendTelegram(chatId, telegramMsg);
  }

  return results;
}

function buildAlertMessage(
  alert: Record<string, unknown>,
  product: Record<string, unknown>
): string {
  const type = alert.alert_type as string;
  const name = product.name as string;
  const currentPrice = product.current_price as number;
  const originalPrice = product.original_price as number;
  const targetValue = alert.target_value as number;
  const platform = (product.platform as string || "").toUpperCase();
  const currency = (product.currency as string) || "INR";

  let reason = "";
  switch (type) {
    case "price_drop":
      reason = `Price dropped to ${currency} ${currentPrice.toLocaleString()} (target: ${currency} ${targetValue.toLocaleString()})`;
      break;
    case "target_price":
      reason = `Price reached target: ${currency} ${currentPrice.toLocaleString()} ≤ ${currency} ${targetValue.toLocaleString()}`;
      break;
    case "percentage_drop":
      const dropPct = (((originalPrice - currentPrice) / originalPrice) * 100).toFixed(1);
      reason = `Price dropped ${dropPct}% (target: ${targetValue}%)`;
      break;
    case "back_in_stock":
      reason = "Product is back in stock!";
      break;
    default:
      reason = `Alert condition met for ${type}`;
  }

  return `<b>🔔 FineDeal Price Alert</b>\n\n<b>${name}</b>\n📦 ${platform}\n💰 ${reason}\n\n🔗 ${product.url || "N/A"}`;
}
