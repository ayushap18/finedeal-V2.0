"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ExtensionHeader from "@/components/ExtensionHeader";

const quickTargets = [115000, 120000, 110000];

export default function AlertSetupPage() {
  const router = useRouter();
  const [targetPrice, setTargetPrice] = useState(120000);
  const [emailOn, setEmailOn] = useState(true);
  const [telegramOn, setTelegramOn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (emailOn && !userEmail) {
      alert("Please enter your email address");
      return;
    }
    if (telegramOn && !telegramChatId) {
      alert("Please enter your Telegram Chat ID.\n\nTo get it: Open Telegram, search for @userinfobot, start it, and it will show your Chat ID.");
      return;
    }

    setSaving(true);
    try {
      // Save user contact info to settings
      const settingsUpdate: Record<string, string> = {};
      if (userEmail) settingsUpdate.user_email = userEmail;
      if (telegramChatId) settingsUpdate.telegram_chat_id = telegramChatId;

      if (Object.keys(settingsUpdate).length > 0) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settingsUpdate),
        });
      }

      // Create the alert
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: "first",
          alert_type: "target_price",
          target_value: targetPrice,
          notify_email: emailOn,
          notify_telegram: telegramOn,
          user_email: userEmail,
          telegram_chat_id: telegramChatId,
        }),
      });

      // Send a test notification
      if (emailOn && userEmail) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "email",
            to: userEmail,
            subject: "FineDeal Alert Set!",
            message: `Your price alert has been set! We'll notify you when the price drops to ₹${targetPrice.toLocaleString("en-IN")} or below.`,
          }),
        }).catch(() => {});
      }

      if (telegramOn && telegramChatId) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "telegram",
            chat_id: telegramChatId,
            message: `🔔 <b>FineDeal Alert Set!</b>\n\nWe'll notify you when the price drops to ₹${targetPrice.toLocaleString("en-IN")} or below.`,
          }),
        }).catch(() => {});
      }

      router.push("/extension/results");
    } catch {
      alert("Failed to set alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader title="Set Alert" showClose />

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-border bg-bg-card p-3">
            <p className="text-sm font-medium text-text-primary">Samsung Galaxy S24 Ultra 256GB</p>
            <p className="mt-1 text-xs text-text-secondary">Current best: ₹1,25,999 (Croma)</p>
          </div>

          <div>
            <p className="text-xs text-text-secondary mb-2">Target Price</p>
            <div className="flex items-center rounded-lg border border-border bg-bg-input px-3 py-2.5">
              <span className="text-text-secondary text-sm">₹</span>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                className="ml-2 bg-transparent text-text-primary font-semibold outline-none w-full"
              />
            </div>
            <div className="mt-2 flex gap-2">
              {quickTargets.map((target) => (
                <button
                  key={target}
                  onClick={() => setTargetPrice(target)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    targetPrice === target
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-border bg-bg-card text-text-secondary"
                  }`}
                >
                  ₹{target.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-text-secondary mb-2">Notify via</p>
            <div className="space-y-2">
              {/* Email toggle + input */}
              <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-text-primary">Email</p>
                  </div>
                  <button onClick={() => setEmailOn(!emailOn)} className={`h-6 w-11 rounded-full p-1 transition-colors ${emailOn ? "bg-success" : "bg-border"}`}>
                    <div className={`h-4 w-4 rounded-full bg-bg-page transition-transform ${emailOn ? "ml-auto" : ""}`} />
                  </button>
                </div>
                {emailOn && (
                  <div className="px-3 pb-2.5">
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent"
                    />
                  </div>
                )}
              </div>

              {/* Telegram toggle + input */}
              <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <p className="text-sm text-text-primary">Telegram</p>
                  </div>
                  <button onClick={() => setTelegramOn(!telegramOn)} className={`h-6 w-11 rounded-full p-1 transition-colors ${telegramOn ? "bg-success" : "bg-border"}`}>
                    <div className={`h-4 w-4 rounded-full bg-bg-page transition-transform ${telegramOn ? "ml-auto" : ""}`} />
                  </button>
                </div>
                {telegramOn && (
                  <div className="px-3 pb-2.5 space-y-2">
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Your Telegram Chat ID"
                      className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent"
                    />
                    <p className="text-[10px] text-text-tertiary">
                      Message @userinfobot on Telegram to get your Chat ID. Bot: @finedeal_bot
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-text-on-accent disabled:opacity-50"
          >
            {saving ? "Setting Alert..." : "Set Price Alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
