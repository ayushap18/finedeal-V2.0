import { readFileSync, existsSync } from "fs";
import { join } from "path";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Load .env.local keys
let _envLocalCache: Record<string, string> | null = null;
function loadEnvLocal(): Record<string, string> {
  if (_envLocalCache) return _envLocalCache;
  _envLocalCache = {};
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          _envLocalCache[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
        }
      }
    }
  }
  return _envLocalCache;
}

function getGroqKey() {
  const envLocal = loadEnvLocal();
  return envLocal.GROQ_API_KEY || process.env.GROQ_API_KEY || "";
}
function getOpenRouterKey() {
  const envLocal = loadEnvLocal();
  return envLocal.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "";
}

// --------------- Groq (fast, primary) ---------------

async function groqChat(messages: { role: string; content: string }[], temperature = 0.3) {
  const key = getGroqKey();
  if (!key) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// --------------- OpenRouter (replaces Gemini) ---------------

async function openRouterChat(messages: { role: string; content: string }[], temperature = 0.3) {
  const key = getOpenRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://finedeal.app",
      "X-Title": "FineDeal Price Comparison",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages,
      temperature,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJsonResponse(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in AI response");
  return JSON.parse(match[0]);
}

// --------------- Groq functions ---------------

export async function classifyProduct(productName: string, description?: string) {
  const prompt = `Classify the following product into exactly one category from this list: Electronics, Fashion, Home, Sports, Beauty, Books, Toys, Automotive, Grocery, Health.

Product name: "${productName}"
${description ? `Description: "${description}"` : ""}

Respond with ONLY a JSON object (no markdown, no extra text):
{"category":"<category>","confidence":<0-1 number>,"tags":["tag1","tag2","tag3"]}`;

  const raw = await groqChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

export async function compareProducts(products: { name: string; price: number; platform: string }[]) {
  const listing = products.map((p, i) => `${i + 1}. ${p.name} — ₹${p.price} on ${p.platform}`).join("\n");

  const prompt = `Compare these products and recommend the best deal:

${listing}

Respond with ONLY a JSON object (no markdown, no extra text):
{"recommendation":"<which product to buy and why>","analysis":"<brief comparison>","bestDeal":{"name":"<product name>","price":<price>,"platform":"<platform>"}}`;

  const raw = await groqChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

export async function analyzePriceTrend(product: string, priceHistory: { date: string; price: number }[]) {
  const history = priceHistory.map((p) => `${p.date}: ₹${p.price}`).join("\n");

  const prompt = `Analyze the price trend for "${product}":

${history}

Respond with ONLY a JSON object (no markdown, no extra text):
{"trend":"up"|"down"|"stable","prediction":"<predicted next price movement>","advice":"<buy now or wait>"}`;

  const raw = await groqChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

// --------------- OpenRouter functions (replaces Gemini) ---------------

export async function geminiClassify(productName: string) {
  const prompt = `Classify this product into one category (Electronics, Fashion, Home, Sports, Beauty, Books, Toys, Automotive, Grocery, Health).

Product: "${productName}"

Respond with ONLY a JSON object (no markdown):
{"category":"<category>","confidence":<0-1>,"tags":["tag1","tag2","tag3"]}`;

  const raw = await openRouterChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

export async function generateDealSummary(products: { name: string; price: number; platform?: string }[]) {
  const listing = products.map((p, i) => `${i + 1}. ${p.name} — ₹${p.price}${p.platform ? ` (${p.platform})` : ""}`).join("\n");

  const prompt = `Write a brief, friendly 2-3 sentence summary of these current deals for a shopping assistant:

${listing}

Respond with ONLY a JSON object (no markdown):
{"summary":"<natural language summary>"}`;

  const raw = await openRouterChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

// --------------- Health check ---------------

export async function checkApiConnectivity() {
  const results: { groq: { status: string; model?: string; error?: string }; gemini: { status: string; model?: string; error?: string } } = {
    groq: { status: "unknown" },
    gemini: { status: "unknown" },
  };

  // Check Groq
  try {
    const groqKey = getGroqKey();
    if (!groqKey) throw new Error("API key not configured");
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Reply with only: ok" }], temperature: 0, max_tokens: 5 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.groq = { status: "connected", model: "llama-3.3-70b-versatile" };
  } catch (e: unknown) {
    results.groq = { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  // Check OpenRouter (replaces Gemini)
  try {
    const orKey = getOpenRouterKey();
    if (!orKey) throw new Error("API key not configured");
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://finedeal.app" },
      body: JSON.stringify({ model: "google/gemini-2.0-flash-001", messages: [{ role: "user", content: "Reply with only: ok" }], max_tokens: 5 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.gemini = { status: "connected", model: "gemini-2.0-flash (OpenRouter)" };
  } catch (e: unknown) {
    results.gemini = { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  return results;
}
