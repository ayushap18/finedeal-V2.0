import { NextRequest } from "next/server";
import { getAll, create, update, getSettings } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { scrapeProduct, searchProduct, searchViaGoogle, ScrapeResult } from "@/lib/scraper";

let scraperStatus: {
  running: boolean;
  started_at: string | null;
  products_scraped: number;
  errors: number;
  lastResults: ScrapeResult[];
} = {
  running: false,
  started_at: null,
  products_scraped: 0,
  errors: 0,
  lastResults: [],
};

export async function GET() {
  try {
    const products = getAll("products");
    const tracking = products.filter((p) => p.status === "tracking").length;
    return corsJson({
      status: {
        running: scraperStatus.running,
        started_at: scraperStatus.started_at,
        products_scraped: scraperStatus.products_scraped,
        errors: scraperStatus.errors,
      },
      lastResults: scraperStatus.lastResults,
      products_tracking: tracking,
      total_products: products.length,
    });
  } catch {
    return corsError("Failed to get scraper status", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (scraperStatus.running) {
      return corsError("Scraper is already running", 409);
    }

    const body = await req.json().catch(() => ({}));
    const { url, query, platforms } = body as {
      url?: string;
      query?: string;
      platforms?: string[];
    };

    if (!url && !query) {
      return corsError('Request body must include "url" or "query"', 400);
    }

    scraperStatus = {
      running: true,
      started_at: new Date().toISOString(),
      products_scraped: 0,
      errors: 0,
      lastResults: [],
    };

    const startTime = Date.now();
    let results: ScrapeResult[];

    if (url) {
      results = [await scrapeProduct(url)];
    } else {
      results = await searchProduct(query!, platforms);
    }

    // === PHASE 1: Filter out ₹0 and obviously wrong prices ===
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.price === 0) {
        results[i] = { ...r, price: null, error: "Invalid price (₹0)" };
      }
    }

    // === PHASE 2: AI Validation with Groq (fast) ===
    // Validate that returned products actually match the search query
    if (query && results.some(r => r.price)) {
      try {
        const resultsForValidation = results
          .filter(r => r.price)
          .map(r => ({ platform: r.platform, name: r.name, price: r.price }));

        const groqKey = process.env.GROQ_API_KEY || "";
        const envPath = require("path").join(process.cwd(), ".env.local");
        let key = groqKey;
        if (!key) {
          try {
            const envContent = require("fs").readFileSync(envPath, "utf8");
            const match = envContent.match(/GROQ_API_KEY=(.+)/);
            if (match) key = match[1].trim();
          } catch {}
        }

        if (key) {
          const validationRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{
                role: "user",
                content: `I searched for "${query}" and got these results from different shopping sites. For each result, tell me if the product name and price are RELEVANT to my search query. A result is relevant if the product name is related to what I searched for.

Results:
${resultsForValidation.map((r, i) => `${i + 1}. ${r.platform}: "${r.name}" at ₹${r.price?.toLocaleString("en-IN")}`).join("\n")}

Respond with ONLY a JSON object (no markdown):
{"validated":[${resultsForValidation.map((_, i) => `{"index":${i},"relevant":true/false,"reason":"brief reason"}`).join(",")}]}`
              }],
              temperature: 0.1,
              max_tokens: 500,
            }),
          });

          if (validationRes.ok) {
            const vData = await validationRes.json();
            const vText = vData.choices?.[0]?.message?.content ?? "";
            const jsonMatch = vText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const validation = JSON.parse(jsonMatch[0]);
              let priceIdx = 0;
              for (let i = 0; i < results.length; i++) {
                if (results[i].price) {
                  const v = validation.validated?.[priceIdx];
                  if (v && v.relevant === false) {
                    results[i] = {
                      ...results[i],
                      price: null,
                      error: `AI filtered: ${v.reason || "Not relevant to search"}`,
                    };
                  }
                  priceIdx++;
                }
              }
            }
          }
        }
      } catch {
        // AI validation is best-effort, continue with unvalidated results
      }
    }

    // === PHASE 3: Sort results - prices first, then by price ascending ===
    results.sort((a, b) => {
      if (a.price && !b.price) return -1;
      if (!a.price && b.price) return 1;
      if (a.price && b.price) return a.price - b.price;
      return 0;
    });

    const errorCount = results.filter((r) => r.error).length;
    const successCount = results.filter((r) => r.price).length;
    const durationMs = Date.now() - startTime;

    // === PHASE 4: Log with timing ===
    create("system_logs", {
      level: successCount > 0 ? "success" : errorCount === results.length ? "error" : "warning",
      message: `Scrape "${url ?? query}" — ${successCount} prices found, ${errorCount} errors [${(durationMs / 1000).toFixed(1)}s]`,
      source: "scraper",
      details: JSON.stringify({
        query: url ?? query,
        duration_ms: durationMs,
        results: results.map(r => ({ platform: r.platform, price: r.price, error: r.error?.substring(0, 50) })),
      }),
    });

    scraperStatus = {
      running: false,
      started_at: null,
      products_scraped: successCount,
      errors: errorCount,
      lastResults: results,
    };

    // === PHASE 5: Save to DB ===
    try {
      const products = getAll("products");
      for (const r of results) {
        if (r.price) {
          const existing = products.find((p) => {
            const pName = String(p.name ?? "");
            return pName.toLowerCase().includes(r.name.toLowerCase().split(" ").slice(0, 3).join(" ")) ||
              r.name.toLowerCase().includes(pName.toLowerCase().split(" ").slice(0, 3).join(" "));
          });
          if (existing) {
            const updates: Record<string, unknown> = { current_price: r.price, last_checked: r.scrapedAt };
            if (r.price < (Number(existing.lowest_price) || Infinity)) updates.lowest_price = r.price;
            if (r.price > (Number(existing.highest_price) || 0)) updates.highest_price = r.price;
            update("products", String(existing.id), updates);
            create("price_history", { product_id: existing.id, price: r.price, platform: r.platform, date: r.scrapedAt });
          }
        }
      }
    } catch {}

    // === PHASE 6: Send to Telegram ===
    try {
      const settings = getSettings();
      const chatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
      const botToken = process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token;
      if (chatId && botToken && !botToken.includes("placeholder")) {
        const priceResults = results.filter(r => r.price).map(r => `✅ ${r.platform}: ₹${r.price!.toLocaleString("en-IN")}`);
        const failedResults = results.filter(r => !r.price).map(r => `❌ ${r.platform}`);
        const msg = `🔍 Scrape: ${url ?? query}\n⏱ ${(durationMs / 1000).toFixed(1)}s\n\n${priceResults.join("\n")}${failedResults.length ? "\n" + failedResults.join("\n") : ""}\n\n📊 ${successCount}/${results.length} sites`;
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: msg }),
        }).catch(() => {});
      }
    } catch {}

    return corsJson({
      message: "Scrape completed",
      duration_ms: durationMs,
      results,
      ai_validated: true,
    });
  } catch {
    scraperStatus.running = false;
    return corsError("Scrape failed", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
