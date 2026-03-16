"use client";

import { useState, useEffect } from "react";
import ExtensionHeader from "@/components/ExtensionHeader";

export default function SettingsPage() {
  const [emailOn, setEmailOn] = useState(true);
  const [telegramOn, setTelegramOn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState([
    { label: "Amazon.in", checked: true },
    { label: "Flipkart", checked: true },
    { label: "Croma", checked: true },
    { label: "Myntra", checked: false },
    { label: "AJIO", checked: false },
    { label: "Snapdeal", checked: false },
    { label: "Tata CLiQ", checked: false },
    { label: "Nykaa", checked: false },
    { label: "Vijay Sales", checked: false },
  ]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setEmailOn(!!data.settings.smtp_host);
          setTelegramOn(!!data.settings.telegram_bot_token && !String(data.settings.telegram_bot_token).includes("placeholder"));
          if (data.settings.user_email) setUserEmail(data.settings.user_email);
          if (data.settings.telegram_chat_id) setTelegramChatId(data.settings.telegram_chat_id);
        }
      })
      .catch(() => {});
  }, []);

  const toggleSite = (idx: number) => {
    setSites((prev) => prev.map((s, i) => i === idx ? { ...s, checked: !s.checked } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userEmail,
          telegram_chat_id: telegramChatId,
          notifications_enabled: emailOn || telegramOn,
        }),
      });
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-sidebar overflow-hidden">
        <ExtensionHeader title="Settings" showClose />

        <div className="space-y-5 p-5">
          {/* User Contact Info */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Your Contact Info
            </p>
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-text-secondary">Email Address</p>
                </div>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent"
                />
              </div>
              <div className="rounded-lg border border-border bg-bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <p className="text-xs text-text-secondary">Telegram Chat ID</p>
                </div>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="Your Chat ID (@userinfobot)"
                  className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder outline-none focus:border-accent"
                />
                <p className="text-[10px] text-text-tertiary">Bot: @finedeal_bot</p>
              </div>
            </div>
          </div>

          {/* Notification Preferences */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Notification Preferences
            </p>
            <div className="space-y-2">
              {[
                { label: "Email notifications", on: emailOn, toggle: () => setEmailOn(!emailOn) },
                { label: "Telegram notifications", on: telegramOn, toggle: () => setTelegramOn(!telegramOn) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2.5">
                  <p className="text-sm text-text-primary">{item.label}</p>
                  <button onClick={item.toggle} className={`h-6 w-11 rounded-full p-1 transition-colors ${item.on ? "bg-success" : "bg-border"}`}>
                    <div className={`h-4 w-4 rounded-full bg-bg-page transition-transform ${item.on ? "ml-auto" : ""}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison Sites */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Comparison Sites
            </p>
            <div className="space-y-2 rounded-lg border border-border bg-bg-card p-3">
              {sites.map((site, idx) => (
                <button key={site.label} onClick={() => toggleSite(idx)} className="flex items-center justify-between w-full py-1">
                  <p className="text-sm text-text-primary">{site.label}</p>
                  <div className={`h-4 w-4 rounded border flex items-center justify-center ${site.checked ? "border-accent bg-accent" : "border-border bg-bg-input"}`}>
                    {site.checked && (
                      <svg className="w-3 h-3 text-text-on-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Save + About */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-text-on-accent disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>

          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-3">
            <p className="text-sm text-text-secondary">FineDeal v4.0.0</p>
            <button className="text-xs font-medium text-warning">Clear Cache</button>
          </div>
        </div>
      </div>
    </div>
  );
}
