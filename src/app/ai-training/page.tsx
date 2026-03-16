"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface AiModel {
  id: string;
  name: string;
  provider: string;
  status: string;
  accuracy: number;
  last_trained: string | null;
}

interface LogEntry {
  time: string;
  msg: string;
  color: string;
}

const defaultModels = [
  { name: "Price Prediction v3.2", desc: "LSTM + Transformer - 94.7% accuracy", badge: "Active", badgeClass: "bg-success-tint text-success" },
  { name: "Product Classifier v2.1", desc: "Groq Llama 3 - 97.2% accuracy", badge: "Active", badgeClass: "bg-success-tint text-success" },
  { name: "Smart Matcher v4.0", desc: "Multi-factor scoring - 89% match rate", badge: "Training", badgeClass: "bg-accent-tint text-accent" },
  { name: "Gemini NLP Analyzer", desc: "Natural language queries - v1.0", badge: "Beta", badgeClass: "bg-blue-tint text-blue" },
];

export default function AITrainingPage() {
  const [models, setModels] = useState(defaultModels);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statCards, setStatCards] = useState({
    accuracy: "--",
    accuracySub: "Checking...",
    samples: "--",
    samplesSub: "Checking...",
    classRate: "--",
    classRateSub: "Checking...",
    lastCheck: "Never",
  });
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);

  const addLog = useCallback((msg: string, color = "text-text-muted") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [{ time, msg, color }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    addLog("Initializing AI module...", "text-blue");

    fetch("/api/ai")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          setModels(data.models.map((m: AiModel) => ({
            name: m.name ?? "Unknown Model",
            desc: `${m.provider ?? "Unknown"} - ${m.accuracy ?? 0}% accuracy`,
            badge: m.status === "active" ? "Active" : m.status === "training" ? "Training" : "Offline",
            badgeClass: m.status === "active" ? "bg-success-tint text-success" : m.status === "training" ? "bg-accent-tint text-accent" : "bg-red-tint text-red",
          })));
        }

        const ts = data.training_stats;
        const groqOk = data.connectivity?.groq?.status === "connected";
        const geminiOk = data.connectivity?.gemini?.status === "connected";
        const lastChecked = ts?.last_checked
          ? new Date(ts.last_checked).toLocaleString()
          : "Never";

        setStatCards({
          accuracy: ts?.model_accuracy ? `${ts.model_accuracy}%` : "N/A",
          accuracySub: groqOk ? "Groq API connected" : "Groq API offline",
          samples: ts?.connected_models?.toString() ?? (groqOk || geminiOk ? "1+" : "0"),
          samplesSub: `${[groqOk && "Groq", geminiOk && "Gemini"].filter(Boolean).join(" + ") || "No APIs connected"}`,
          classRate: ts?.classification_rate ? `${ts.classification_rate}%` : "N/A",
          classRateSub: lastChecked !== "Never" ? `Checked: ${lastChecked}` : "Not checked",
          lastCheck: lastChecked,
        });

        if (groqOk) addLog("[OK] Groq API (LLaMA 3.3 70B) connected", "text-success");
        else addLog("[FAIL] Groq API not available", "text-red");

        if (geminiOk) addLog("[OK] Gemini API connected", "text-success");
        else addLog(`[FAIL] Gemini API: ${data.connectivity?.gemini?.error ?? "not available"}`, "text-red");

        addLog("AI module initialization complete", "text-blue");
      })
      .catch((err) => {
        addLog(`Failed to fetch AI status: ${err.message}`, "text-red");
      })
      .finally(() => setLoading(false));
  }, [addLog]);

  const handleStartTraining = async () => {
    setTraining(true);
    addLog("Starting AI validation run...", "text-yellow");

    try {
      addLog("Testing product classification...", "text-text-muted");
      const classifyRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "classify", product: "Samsung Galaxy S24 Ultra 256GB", description: "Flagship smartphone with S Pen" }),
      });
      const classifyData = await classifyRes.json();

      if (classifyData.result) {
        addLog(`Classification: ${classifyData.result.category} (${(classifyData.result.confidence * 100).toFixed(1)}% confidence)`, "text-success");
        addLog(`Tags: ${classifyData.result.tags?.join(", ") ?? "none"}`, "text-text-muted");
      } else {
        addLog(`Classification failed: ${classifyData.error ?? "unknown error"}`, "text-red");
      }

      addLog("Testing product comparison...", "text-text-muted");
      const compareRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compare",
          products: [
            { name: "Samsung Galaxy S24 Ultra", price: 89999, platform: "Amazon" },
            { name: "iPhone 16 Pro Max", price: 144900, platform: "Flipkart" },
          ],
        }),
      });
      const compareData = await compareRes.json();

      if (compareData.result) {
        addLog(`Best deal: ${compareData.result.bestDeal?.name ?? "N/A"} at Rs.${compareData.result.bestDeal?.price?.toLocaleString() ?? "N/A"}`, "text-success");
      } else {
        addLog(`Comparison failed: ${compareData.error ?? "unknown error"}`, "text-red");
      }

      addLog("AI validation run completed!", "text-success");
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : "unknown"}`, "text-red");
    } finally {
      setTraining(false);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    addLog("Starting Gemini-specific test...", "text-yellow");

    try {
      addLog("Testing Gemini summarization...", "text-text-muted");
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "summarize",
          text: "Samsung Galaxy S24 Ultra is a flagship smartphone with a 6.8-inch display, Snapdragon 8 Gen 3 processor, 200MP camera, and S Pen support. It is priced at Rs.1,29,999 on Amazon and Rs.1,34,999 on Flipkart.",
        }),
      });
      const data = await res.json();

      if (data.result) {
        addLog(`Gemini Summary: ${typeof data.result === "string" ? data.result : JSON.stringify(data.result).slice(0, 200)}`, "text-success");
      } else if (data.error) {
        addLog(`Gemini summarize failed: ${data.error}`, "text-red");
      } else {
        addLog("Gemini returned no result (may not support summarize action)", "text-yellow");
      }

      addLog("Testing Gemini classification...", "text-text-muted");
      const classRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "classify",
          product: "Apple AirPods Pro 2nd Gen",
          description: "Wireless earbuds with active noise cancellation and transparency mode",
        }),
      });
      const classData = await classRes.json();

      if (classData.result) {
        addLog(`Gemini Classification: ${classData.result.category} (${(classData.result.confidence * 100).toFixed(1)}%)`, "text-success");
      } else {
        addLog(`Gemini classification failed: ${classData.error ?? "unknown"}`, "text-red");
      }

      addLog("Gemini test completed!", "text-success");
    } catch (err) {
      addLog(`Gemini test error: ${err instanceof Error ? err.message : "unknown"}`, "text-red");
    } finally {
      setTestingGemini(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="p-8 flex items-center justify-center h-64"><p className="text-text-secondary">Loading...</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="px-10 py-8 space-y-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">AI Training Center</h1>
            <p className="text-text-secondary text-[13px] font-normal mt-1">Manage ML models for price prediction and product classification</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestGemini}
              disabled={testingGemini}
              className="flex items-center gap-2 bg-blue-tint hover:bg-blue-tint/80 text-blue font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 0 1 0 12 6 6 0 0 1 0-12z" />
              </svg>
              {testingGemini ? "Testing Gemini..." : "Test Gemini"}
            </button>
            <button
              onClick={handleStartTraining}
              disabled={training}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-text-on-accent font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
              </svg>
              {training ? "Running..." : "Run AI Test"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <p className="text-text-secondary text-sm">Model Accuracy</p>
            <p className="text-[28px] font-bold text-success mt-1">{statCards.accuracy}</p>
            <p className="text-text-secondary text-[11px] mt-1">{statCards.accuracySub}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <p className="text-text-secondary text-sm">Connected Models</p>
            <p className="text-[28px] font-bold text-text-primary mt-1">{statCards.samples}</p>
            <p className="text-success text-[11px] mt-1">{statCards.samplesSub}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <p className="text-text-secondary text-sm">Classification Rate</p>
            <p className="text-[28px] font-bold text-blue mt-1">{statCards.classRate}</p>
            <p className="text-text-secondary text-[11px] mt-1">{statCards.classRateSub}</p>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-5">
            <p className="text-text-secondary text-sm">Last Check</p>
            <p className="text-[16px] font-bold text-text-primary mt-3">{statCards.lastCheck}</p>
            <p className="text-text-secondary text-[11px] mt-1">Last AI connectivity check</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 bg-bg-card border border-border rounded-lg p-6">
            <h2 className="text-text-primary font-semibold mb-4">Active Models</h2>
            <div className="space-y-3">
              {models.map((m) => (
                <div key={m.name} className="flex items-center justify-between bg-bg-page rounded-lg px-4 py-3">
                  <div>
                    <p className="text-text-primary text-sm font-medium">{m.name}</p>
                    <p className="text-text-secondary text-xs mt-0.5">{m.desc}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${m.badgeClass}`}>{m.badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-[420px] bg-bg-card border border-border rounded-lg p-6">
            <h2 className="text-text-primary font-semibold mb-4">Live Log</h2>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-text-tertiary text-xs font-mono">No logs yet...</p>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="bg-bg-page rounded-lg px-4 py-2.5">
                    <span className="text-text-tertiary text-xs font-mono mr-2">{l.time}</span>
                    <span className={`text-xs font-mono ${l.color}`}>{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
