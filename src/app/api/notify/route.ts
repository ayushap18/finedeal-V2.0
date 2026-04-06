import { NextRequest } from "next/server";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { sendEmail, sendTelegram } from "@/lib/notifications";
import { getSettings } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, to, subject, message, body: emailBody } = body;

    if (type === "test") {
      const settings = getSettings();
      const emailTo = to || settings.user_email || settings.smtp_user || process.env.SMTP_USER || "finedeal@codecatalysts.tech";
      const emailResult = await sendEmail(
        emailTo,
        "FineDeal Test Notification",
        "This is a test email from FineDeal notification system."
      );
      const testChatId = body.chat_id || (settings.telegram_chat_id && settings.telegram_chat_id.trim()) || process.env.TELEGRAM_CHAT_ID || "";
      const telegramResult = await sendTelegram(
        testChatId,
        "🧪 <b>FineDeal Test</b>\nThis is a test message from your notification system."
      );
      return corsJson({
        message: "Test notifications sent",
        email: emailResult,
        telegram: telegramResult,
      });
    }

    if (type === "email") {
      if (!to) return corsError("'to' email address is required for email notifications");
      const content = emailBody || message;
      if (!content) return corsError("message or body is required");

      const result = await sendEmail(to, subject || "FineDeal Alert", content);
      return result.success
        ? corsJson({ message: "Email sent successfully", type: "email", to, result })
        : corsError(`Failed to send email: ${result.error}`, 503);
    }

    if (type === "telegram") {
      if (!message) return corsError("message is required");

      const settings = getSettings();
      const chatId = body.chat_id || (settings.telegram_chat_id && settings.telegram_chat_id.trim()) || process.env.TELEGRAM_CHAT_ID || "";
      const result = await sendTelegram(chatId, message);
      return result.success
        ? corsJson({ message: "Telegram message sent successfully", type: "telegram", result })
        : corsError(`Failed to send Telegram message: ${result.error}`, 503);
    }

    return corsError("Invalid notification type. Use 'email', 'telegram', or 'test'");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return corsError(`Failed to send notification: ${msg}`, 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
