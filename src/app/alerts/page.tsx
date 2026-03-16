"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

const defaultStats = [
  { label: "Active Alerts", value: "247", color: "text-accent" },
  { label: "Triggered Today", value: "34", color: "text-green" },
  { label: "Email Sent", value: "1,283", color: "text-blue" },
  { label: "Telegram Sent", value: "892", color: "text-purple" },
];

interface AlertItem {
  id: string;
  product: string;
  target: string;
  current: string;
  channels: string[];
  status: string;
}

const defaultAlerts: AlertItem[] = [
  {
    id: "1",
    product: "Samsung Galaxy S24 Ultra",
    target: "\u20B985,000",
    current: "\u20B989,999",
    channels: ["email", "telegram"],
    status: "Active",
  },
  {
    id: "2",
    product: "iPhone 16 Pro Max",
    target: "\u20B91,40,000",
    current: "\u20B91,44,900",
    channels: ["email"],
    status: "Active",
  },
  {
    id: "3",
    product: "Sony WH-1000XM5",
    target: "\u20B922,000",
    current: "\u20B924,990",
    channels: ["telegram"],
    status: "Active",
  },
  {
    id: "4",
    product: "MacBook Air M3",
    target: "\u20B995,000",
    current: "\u20B999,990",
    channels: ["email", "telegram"],
    status: "Paused",
  },
  {
    id: "5",
    product: "Nike Air Max 270",
    target: "\u20B97,500",
    current: "\u20B98,995",
    channels: ["email"],
    status: "Triggered!",
  },
];

interface ApiAlert {
  id: string;
  product_name: string;
  target_value: number;
  current_price: number;
  notify_email: boolean;
  notify_telegram: boolean;
  status: string;
}

function StatusBadge({ status }: { status: string }) {
  const isPaused = status === "Paused";
  const isTriggered = status === "Triggered!";
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        isPaused
          ? "bg-yellow-tint text-yellow"
          : isTriggered
          ? "bg-accent-tint text-accent"
          : "bg-green-tint text-green"
      }`}
    >
      {status}
    </span>
  );
}

function ChannelIcons({ channels }: { channels: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {channels.includes("email") && (
        <span className="text-blue" title="Email">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </span>
      )}
      {channels.includes("telegram") && (
        <span className="text-purple" title="Telegram">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 3L1 11l7 2m13-10l-7 14-6-6m13-8l-13 8" />
          </svg>
        </span>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const [stats, setStats] = useState(defaultStats);
  const [alerts, setAlerts] = useState<AlertItem[]>(defaultAlerts);
  const [loading, setLoading] = useState(true);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; platform: string; current_price: number }[]>([]);
  const [newAlertForm, setNewAlertForm] = useState({
    product_id: "",
    targetPrice: "",
    alert_type: "target_price" as string,
    email: true,
    telegram: false,
  });
  const [addLoading, setAddLoading] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchAlerts = () => {
    setLoading(true);
    fetch("/api/alerts")
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) {
          setStats([
            { label: "Active Alerts", value: (data.stats.active ?? 0).toLocaleString(), color: "text-accent" },
            { label: "Triggered Today", value: (data.stats.triggered_today ?? 0).toLocaleString(), color: "text-green" },
            { label: "Email Sent", value: (data.stats.email_sent ?? 0).toLocaleString(), color: "text-blue" },
            { label: "Telegram Sent", value: (data.stats.telegram_sent ?? 0).toLocaleString(), color: "text-purple" },
          ]);
        }
        if (data.alerts) {
          setAlerts(
            data.alerts.map((a: ApiAlert) => {
              const channels: string[] = [];
              if (a.notify_email) channels.push("email");
              if (a.notify_telegram) channels.push("telegram");
              return {
                id: a.id ?? "",
                product: a.product_name ?? "Unknown",
                target: `\u20B9${(a.target_value ?? 0).toLocaleString("en-IN")}`,
                current: `\u20B9${(a.current_price ?? 0).toLocaleString("en-IN")}`,
                channels,
                status: a.status === "active" ? "Active" : a.status === "triggered" ? "Triggered!" : "Paused",
              };
            })
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAlerts();
    fetch("/api/products").then(r => r.json()).then(d => {
      if (d.products) setProducts(d.products.map((p: { id: string; name: string; platform: string; current_price: number }) => ({ id: p.id, name: p.name, platform: p.platform, current_price: p.current_price })));
    }).catch(() => {});
  }, []);

  const handleCreateAlert = async () => {
    if (!newAlertForm.product_id || !newAlertForm.targetPrice.trim()) return;
    setAddLoading(true);
    const selectedProduct = products.find(p => p.id === newAlertForm.product_id);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: newAlertForm.product_id,
          product_name: selectedProduct?.name ?? "",
          platform: selectedProduct?.platform ?? "",
          current_price: selectedProduct?.current_price ?? 0,
          alert_type: newAlertForm.alert_type,
          target_value: parseFloat(newAlertForm.targetPrice),
          notify_email: newAlertForm.email,
          notify_telegram: newAlertForm.telegram,
        }),
      });
      if (res.ok) {
        setShowNewAlert(false);
        setNewAlertForm({ product_id: "", targetPrice: "", alert_type: "target_price", email: true, telegram: false });
        fetchAlerts();
      } else {
        const data = await res.json();
        window.alert(data.error ?? "Failed to create alert");
      }
    } catch {
      window.alert("Failed to create alert");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!confirm("Delete this alert?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      window.alert("Failed to delete alert");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleAlert = async (alert: AlertItem) => {
    setTogglingId(alert.id);
    const newStatus = alert.status === "Active" ? "paused" : "active";
    try {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id
            ? { ...a, status: newStatus === "active" ? "Active" : "Paused" }
            : a
        )
      );
    } catch {
      window.alert("Failed to update alert");
    } finally {
      setTogglingId(null);
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      await fetch("/api/cron");
      fetchAlerts();
    } catch {
      window.alert("Failed to check alerts");
    } finally {
      setCheckingAll(false);
    }
  };

  const handleTestAlert = async (alert: AlertItem) => {
    setTestingId(alert.id);
    try {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: alert.product, channels: alert.channels }),
      });
      const data = await res.json();
      window.alert(data.message ?? "Test notification sent!");
    } catch {
      window.alert("Test notification failed");
    } finally {
      setTestingId(null);
    }
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
            <h1 className="text-2xl font-bold text-text-primary">Alerts Management</h1>
            <p className="text-[13px] text-text-secondary font-normal">
              Manage price drop alerts and notification preferences
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckAll}
              disabled={checkingAll}
              className="flex items-center gap-2 bg-bg-card border border-border hover:border-accent text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {checkingAll ? "Checking..." : "Check All Alerts"}
            </button>
            <button
              onClick={() => setShowNewAlert(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-on-accent px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              New Alert
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-bg-card border border-border rounded-lg p-5"
            >
              <p className="text-sm text-text-secondary">{stat.label}</p>
              <p className={`text-[28px] font-bold mt-1 ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Alerts List Table */}
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar-active text-text-tertiary text-left">
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold">Target Price</th>
                <th className="px-6 py-4 font-semibold">Current Price</th>
                <th className="px-6 py-4 font-semibold">Channel</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {alerts.map((alert) => (
                <tr key={alert.id || alert.product} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-text-primary font-medium">
                    {alert.product}
                  </td>
                  <td className="px-6 py-4 text-accent font-semibold">
                    {alert.target}
                  </td>
                  <td className="px-6 py-4 text-text-light">{alert.current}</td>
                  <td className="px-6 py-4">
                    <ChannelIcons channels={alert.channels} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={alert.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleAlert(alert)}
                        disabled={togglingId === alert.id}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-opacity disabled:opacity-50 ${
                          alert.status === "Active"
                            ? "bg-yellow-tint text-yellow hover:opacity-80"
                            : "bg-green-tint text-green hover:opacity-80"
                        }`}
                        title={alert.status === "Active" ? "Pause alert" : "Resume alert"}
                      >
                        {togglingId === alert.id
                          ? "..."
                          : alert.status === "Active"
                          ? "Pause"
                          : "Resume"}
                      </button>
                      <button
                        onClick={() => handleTestAlert(alert)}
                        disabled={testingId === alert.id}
                        className="px-2.5 py-1 rounded-md bg-blue-tint text-blue text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                        title="Send test notification"
                      >
                        {testingId === alert.id ? "..." : "Test"}
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        disabled={deletingId === alert.id}
                        className="px-2.5 py-1 rounded-md bg-red-tint text-red text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                        title="Delete alert"
                      >
                        {deletingId === alert.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Alert Modal */}
      {showNewAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Create New Alert</h2>
              <button
                onClick={() => setShowNewAlert(false)}
                className="text-text-tertiary hover:text-text-primary text-xl"
              >
                x
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Product *
                </label>
                <select
                  value={newAlertForm.product_id}
                  onChange={(e) => setNewAlertForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.platform})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Alert Type *
                </label>
                <select
                  value={newAlertForm.alert_type}
                  onChange={(e) => setNewAlertForm((f) => ({ ...f, alert_type: e.target.value }))}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="target_price">Target Price</option>
                  <option value="price_drop">Any Price Drop</option>
                  <option value="percentage_drop">Percentage Drop</option>
                  <option value="back_in_stock">Back in Stock</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Target Value (INR or %) *
                </label>
                <input
                  type="number"
                  value={newAlertForm.targetPrice}
                  onChange={(e) => setNewAlertForm((f) => ({ ...f, targetPrice: e.target.value }))}
                  placeholder={newAlertForm.alert_type === "percentage_drop" ? "15" : "85000"}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-placeholder outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Notification Channels
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAlertForm.email}
                      onChange={(e) => setNewAlertForm((f) => ({ ...f, email: e.target.checked }))}
                      className="w-4 h-4 rounded accent-accent"
                    />
                    <span className="text-sm text-text-primary">Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAlertForm.telegram}
                      onChange={(e) => setNewAlertForm((f) => ({ ...f, telegram: e.target.checked }))}
                      className="w-4 h-4 rounded accent-accent"
                    />
                    <span className="text-sm text-text-primary">Telegram</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowNewAlert(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlert}
                disabled={addLoading || !newAlertForm.product_id || !newAlertForm.targetPrice.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {addLoading ? "Creating..." : "Create Alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
