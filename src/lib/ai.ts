import { readFileSync, existsSync } from "fs";
import { join } from "path";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

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
function getGeminiKey() {
  const envLocal = loadEnvLocal();
  return envLocal.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
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

// --------------- Gemini (direct API) ---------------

async function geminiChat(messages: { role: string; content: string }[], temperature = 0.3) {
  const key = getGeminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  // Convert chat messages to Gemini format
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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

// --------------- Gemini functions ---------------

export async function geminiClassify(productName: string) {
  const prompt = `Classify this product into one category (Electronics, Fashion, Home, Sports, Beauty, Books, Toys, Automotive, Grocery, Health).

Product: "${productName}"

Respond with ONLY a JSON object (no markdown):
{"category":"<category>","confidence":<0-1>,"tags":["tag1","tag2","tag3"]}`;

  const raw = await geminiChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

export async function generateDealSummary(products: { name: string; price: number; platform?: string }[]) {
  const listing = products.map((p, i) => `${i + 1}. ${p.name} — ₹${p.price}${p.platform ? ` (${p.platform})` : ""}`).join("\n");

  const prompt = `Write a brief, friendly 2-3 sentence summary of these current deals for a shopping assistant:

${listing}

Respond with ONLY a JSON object (no markdown):
{"summary":"<natural language summary>"}`;

  const raw = await geminiChat([{ role: "user", content: prompt }]);
  return parseJsonResponse(raw);
}

// --------------- Scraped Price Analysis (Gemini) ---------------

export async function analyzeScrapedPrices(
  query: string,
  results: { platform: string; price: number; name: string }[]
): Promise<{
  bestDeal: { platform: string; price: number; name: string };
  recommendation: string;
  confidence: number;
  priceInsight: string;
  shouldBuy: boolean;
}> {
  const listing = results
    .map((r, i) => `${i + 1}. ${r.platform}: "${r.name}" at ₹${r.price.toLocaleString("en-IN")}`)
    .join("\n");

  const prompt = `You are a shopping deal analyst. I searched for "${query}" and found these prices across platforms:

${listing}

Analyze these results and respond with ONLY a JSON object (no markdown, no extra text):
{
  "bestDeal": {"platform":"<platform name>","price":<number>,"name":"<product name>"},
  "recommendation": "<1-2 sentence recommendation on which to buy and why>",
  "confidence": <0-100 score of how confident you are in this recommendation>,
  "priceInsight": "<1-2 sentence insight about the pricing pattern, whether prices might drop, market context>",
  "shouldBuy": <true if now is a good time to buy, false if they should wait>
}`;

  const raw = await geminiChat([{ role: "user", content: prompt }], 0.2);
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

  // Check Gemini (direct API)
  try {
    const geminiKey = getGeminiKey();
    if (!geminiKey) throw new Error("API key not configured");
    const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with only: ok" }] }], generationConfig: { maxOutputTokens: 5 } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.gemini = { status: "connected", model: "gemini-3-flash-preview" };
  } catch (e: unknown) {
    results.gemini = { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  return results;
}
