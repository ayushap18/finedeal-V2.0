"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface SettingsData {
  groq_api_key: string;
  gemini_api_key: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
}

interface ApiCard {
  name: string;
  key: string;
  description: string;
  iconClass: string;
  icon: React.ReactNode;
  status: "connected" | "not_configured";
  fields: { label: string; value?: string; placeholder?: string }[];
}

const defaultApiCards: ApiCard[] = [
  {
    name: "Groq API",
    key: "groq",
    description: "Product classification with Llama 3",
    iconClass: "bg-accent-tint text-accent",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    status: "connected" as const,
    fields: [
      { label: "API Key", value: "gsk_....3kF9" },
    ],
  },
  {
    name: "Google Gemini",
    key: "gemini",
    description: "Natural language product queries",
    iconClass: "bg-blue-tint text-blue",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 0 1 0 12 6 6 0 0 1 0-12z" fill="currentColor" />
      </svg>
    ),
    status: "connected" as const,
    fields: [
      { label: "API Key", value: "AIza...yQ8" },
    ],
  },
  {
    name: "Email (Nodemailer)",
    key: "email",
    description: "SMTP email notifications for price drops",
    iconClass: "bg-yellow-tint text-yellow",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    status: "connected" as const,
    fields: [],
  },
  {
    name: "Telegram Bot",
    key: "telegram",
    description: "Instant price drop notifications via Telegram",
    iconClass: "bg-purple-tint text-purple",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M21 3L1 11l7 2m13-10l-7 14-6-6m13-8l-13 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    status: "not_configured" as const,
    fields: [
      { label: "Bot Token", placeholder: "Enter your Telegram bot token..." },
      { label: "Chat ID", placeholder: "Enter chat ID..." },
    ],
  },
];

function buildApiCards(settings: SettingsData | null): ApiCard[] {
  if (!settings) return defaultApiCards;
  return [
    {
      ...defaultApiCards[0],
      status: settings.groq_api_key && !settings.groq_api_key.startsWith("--") ? "connected" as const : defaultApiCards[0].status,
      fields: [{ label: "API Key", value: settings.groq_api_key ?? "" }],
    },
    {
      ...defaultApiCards[1],
      status: settings.gemini_api_key && !settings.gemini_api_key.startsWith("--") ? "connected" as const : defaultApiCards[1].status,
      fields: [{ label: "API Key", value: settings.gemini_api_key ?? "" }],
    },
    {
      ...defaultApiCards[2],
      status: settings.smtp_host ? "connected" as const : defaultApiCards[2].status,
      fields: settings.smtp_host
        ? [{ label: "SMTP Host", value: `${settings.smtp_host}:${settings.smtp_port ?? 587}` }]
        : defaultApiCards[2].fields,
    },
    {
      ...defaultApiCards[3],
      status: settings.telegram_bot_token && !settings.telegram_bot_token.startsWith("--") ? "connected" as const : defaultApiCards[3].status,
      fields: [
        { label: "Bot Token", value: settings.telegram_bot_token ?? "", placeholder: "Enter your Telegram bot token..." },
        { label: "Chat ID", value: settings.telegram_chat_id ?? "", placeholder: "Enter chat ID..." },
      ],
    },
  ];
}

export default function ApiSettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [apiCards, setApiCards] = useState(defaultApiCards);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testResults, setTestResults] = useState<Record<string, "idle" | "testing" | "success" | "failed">>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings(data.settings);
          setApiCards(buildApiCards(data.settings));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaveStatus("saving");
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValues),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings(data.settings);
          setApiCards(buildApiCards(data.settings));
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 3000);
        } else {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
      })
      .catch(() => {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      });
  };

  const handleTestConnection = async (card: ApiCard) => {
    setTestResults((prev) => ({ ...prev, [card.key]: "testing" }));
    try {
      const res = await fetch("/api/ai");
      const data = await res.json();

      let isConnected = false;

      if (card.key === "groq") {
        isConnected = data.connectivity?.groq?.status === "connected";
      } else if (card.key === "gemini") {
        isConnected = data.connectivity?.gemini?.status === "connected";
      } else if (card.key === "email") {
        // For email, check if SMTP settings exist
        isConnected = !!settings?.smtp_host;
      } else if (card.key === "telegram") {
        isConnected = !!settings?.telegram_bot_token && !settings.telegram_bot_token.startsWith("--");
      }

      setTestResults((prev) => ({
        ...prev,
        [card.key]: isConnected ? "success" : "failed",
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [card.key]: "failed" }));
    }

    // Reset after 5 seconds
    setTimeout(() => {
      setTestResults((prev) => ({ ...prev, [card.key]: "idle" }));
    }, 5000);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-7">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">API Settings</h1>
            <p className="text-text-secondary text-[13px] font-normal mt-1">
              Configure API keys and service integrations
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saved" && (
              <span className="text-success text-sm font-medium">Settings saved successfully!</span>
            )}
            {saveStatus === "error" && (
              <span className="text-red text-sm font-medium">Failed to save settings</span>
            )}
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-text-on-accent px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {saveStatus === "saving" ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* API Cards Grid */}
        <div className="grid grid-cols-1 gap-6">
          {apiCards.map((card) => {
            const testState = testResults[card.key] ?? "idle";
            return (
              <div
                key={card.name}
                className="bg-bg-card border border-border rounded-lg p-5 space-y-4"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconClass}`}
                    >
                      {card.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">{card.name}</h3>
                      <p className="text-xs text-text-secondary mt-0.5">{card.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Test Connection button */}
                    <button
                      onClick={() => handleTestConnection(card)}
                      disabled={testState === "testing"}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        testState === "success"
                          ? "bg-green-tint text-green"
                          : testState === "failed"
                          ? "bg-red-tint text-red"
                          : "bg-bg-sidebar text-text-secondary hover:text-text-primary border border-border"
                      }`}
                    >
                      {testState === "testing"
                        ? "Testing..."
                        : testState === "success"
                        ? "Connected!"
                        : testState === "failed"
                        ? "Failed"
                        : "Test Connection"}
                    </button>
                    {/* Status badge */}
                    {card.status === "connected" ? (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-tint text-green">
                        Connected
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-tint text-yellow">
                        Not Configured
                      </span>
                    )}
                  </div>
                </div>

                {/* Fields */}
                {card.fields.length > 0 && (
                  <div className="space-y-3">
                    {card.fields.map((field) => (
                      <div key={field.label}>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          defaultValue={"value" in field ? field.value : undefined}
                          placeholder={"placeholder" in field ? field.placeholder : undefined}
                          onChange={(e) => setFormValues((prev) => ({ ...prev, [`${card.name}_${field.label}`]: e.target.value }))}
                          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-tertiary placeholder-text-placeholder outline-none focus:border-border-hover transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
