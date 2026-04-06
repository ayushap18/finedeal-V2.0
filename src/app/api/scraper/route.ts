import { NextRequest } from "next/server";
import { getAll, create, update, getSettings } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { scrapeProduct, searchProduct, searchViaGoogle, ScrapeResult } from "@/lib/scraper";
import { generateDealSummary, analyzeScrapedPrices } from "@/lib/ai";

// Cache GROQ API key at module level to avoid reading .env.local on every request
let _cachedGroqKey: string | null = null;
function getGroqApiKey(): string {
  if (_cachedGroqKey !== null) return _cachedGroqKey;
  let key = process.env.GROQ_API_KEY || "";
  if (!key) {
    try {
      const envPath = require("path").join(process.cwd(), ".env.local");
      const envContent = require("fs").readFileSync(envPath, "utf8");
      const match = envContent.match(/GROQ_API_KEY=(.+)/);
      if (match) key = match[1].trim();
    } catch {}
  }
  _cachedGroqKey = key;
  return key;
}

/**
 * Clean a raw product title into a short, searchable query.
 * E.g. "iPhone 17 Pro 256 GB: 15.93 cm (6.3″) Display with Promotion up to 120Hz, A19 Pr"
 *   → "iPhone 17 Pro 256GB"
 * E.g. "Godrej 2 Ton 3 Star, 5 Years Warranty, 5-In-1 Convertible, Inverter Split AC (Copper...)"
 *   → "Godrej 2 Ton 3 Star Inverter Split AC"
 */
function cleanSearchQuery(raw: string): string {
  let q = raw;

  // Remove everything after colon/pipe that starts spec text
  q = q.split(/[:\|–—]/).slice(0, 1).join("").trim();

  // Remove parenthetical content (specs, colors, model numbers)
  q = q.replace(/\(([^)]*)\)/g, (_, inner) => {
    // Keep short color/variant names
    if (inner.length <= 10 && !/cm|inch|display|Hz|copper|white|black/i.test(inner)) return `(${inner})`;
    return "";
  });

  // Remove common noise phrases
  q = q.replace(/\b\d+(\.\d+)?\s*(cm|inch|inches|mm)\b/gi, "");
  q = q.replace(/\b\d+\s*Hz\b/gi, "");
  q = q.replace(/\b(display|with\s+promotion|up\s+to|launched|latest|new|best|buy)\b/gi, "");
  q = q.replace(/\b[A-Z]\d{1,2}\s+(Pro\s*chip|Bionic|Fusion)\b/gi, "");

  // Remove warranty/feature/marketing clauses (common in Amazon titles after commas)
  q = q.replace(/,?\s*\d+\s*years?\s*(comprehensive\s*)?warranty[^,]*/gi, "");
  q = q.replace(/,?\s*(convertible\s*cooling|i-sense|dustbuster|wi-?fi|smart\s*energy)[^,]*/gi, "");
  q = q.replace(/\b\d+-in-1\s*(convertible)?\b/gi, "");
  q = q.replace(/\bai\s*powered\b/gi, "");

  // Normalize storage
  q = q.replace(/(\d+)\s*GB/gi, "$1GB");
  q = q.replace(/(\d+)\s*TB/gi, "$1TB");

  // Collapse whitespace and commas
  q = q.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();

  // Smart truncation: keep meaningful words, especially product type keywords
  const words = q.split(/\s+/);
  if (words.length > 8) {
    // Find the product type keyword (AC, TV, Phone, Laptop, etc.) and include it
    const productTypes = /\b(AC|TV|LED|LCD|Phone|Laptop|Tablet|Headphone|Speaker|Refrigerator|Washer|Dryer|Oven|Monitor)\b/i;
    const typeIdx = words.findIndex(w => productTypes.test(w));

    if (typeIdx >= 0 && typeIdx <= 12) {
      // Take words up to and including the product type
      q = words.slice(0, typeIdx + 1).join(" ");
    } else {
      q = words.slice(0, 8).join(" ");
    }
  }

  // Final cleanup: trailing punctuation and commas
  q = q.replace(/[,;.\s]+$/, "").trim();

  return q || raw.substring(0, 50);
}

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
      // Auto-reset if stuck for more than 2 minutes
      const startedAt = scraperStatus.started_at ? new Date(scraperStatus.started_at).getTime() : 0;
      if (Date.now() - startedAt > 120000) {
        scraperStatus.running = false;
      } else {
        return corsError("Scraper is already running", 409);
      }
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
    let aiValidationRan = false;
    // Clean the query: strip specs, promo text, display sizes from raw product titles
    const cleanedQuery = query ? cleanSearchQuery(query) : "";
    if (query) console.log(`[Scraper] Raw query: "${query}" → Cleaned: "${cleanedQuery}"`);

    if (url) {
      results = [await scrapeProduct(url)];
    } else {
      results = await searchProduct(cleanedQuery, platforms);
    }

    // === PHASE 1: Filter out ₹0 and obviously wrong prices ===
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.price === 0) {
        results[i] = { ...r, price: null, error: "Invalid price (₹0)" };
      }
    }

    // === PHASE 1.5: Price variance filter ===
    // Reject prices that are suspiciously far from the cluster of similar prices
    const validPrices = results.filter(r => r.price && r.price > 0).map(r => r.price!);
    if (validPrices.length >= 3) {
      validPrices.sort((a, b) => a - b);
      const median = validPrices[Math.floor(validPrices.length / 2)];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.price) {
          // Reject if price is >60% below median (likely wrong product/accessory)
          if (r.price < median * 0.4) {
            results[i] = { ...r, price: null, error: `Suspicious price ₹${r.price} (60%+ below median ₹${median}) - likely wrong product` };
          }
          // Reject if price is >300% above median (likely wrong product/bundle)
          else if (r.price > median * 4) {
            results[i] = { ...r, price: null, error: `Suspicious price ₹${r.price} (300%+ above median ₹${median}) - likely wrong product` };
          }
        }
      }
    }

    // === PHASE 1.7: Basic product name relevance check ===
    // Filter out results whose product name has zero overlap with the search query
    if (cleanedQuery) {
      const queryWords = cleanedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const genericPageTitles = ["search results", "buy products", "online shopping", "best price", "buy online", "search listing"];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (!r.price || !r.name) continue;
        const nameLower = r.name.toLowerCase();

        // Reject generic page titles (not actual product names)
        if (genericPageTitles.some(t => nameLower.includes(t)) && nameLower.length < 80) {
          results[i] = { ...r, price: null, error: `Rejected: generic page title, not a product ("${r.name.substring(0, 50)}")` };
          continue;
        }

        // Check if at least one significant query word appears in the product name
        const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
        if (queryWords.length >= 2 && matchCount === 0) {
          results[i] = { ...r, price: null, error: `Rejected: product name "${r.name.substring(0, 50)}" has no match with query "${cleanedQuery}"` };
        }
      }
    }

    // === PHASE 2: AI Validation with Groq (fast) ===
    // Validate that returned products actually match the search query
    if (cleanedQuery && results.some(r => r.price)) {
      try {
        const resultsForValidation = results
          .filter(r => r.price)
          .map(r => ({ platform: r.platform, name: r.name, price: r.price }));

        const key = getGroqApiKey();

        if (key) {
          const validationRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{
                role: "user",
                content: `I searched for "${cleanedQuery}" on Indian e-commerce sites. For each result, determine if it is the EXACT SAME type of product I searched for. Be VERY STRICT:

RULES:
- The product must be the SAME category and type (e.g. if I searched for "AC" or "air conditioner", an AC cover/bag/remote is NOT relevant)
- Accessories, covers, cases, bags, and add-ons for the product are NOT relevant
- Generic store pages like "Search Results", "Buy Products Online" are NOT relevant
- The price must be reasonable for the product (e.g. ₹419 for an AC is obviously wrong)
- If the product name doesn't clearly mention the searched item, mark as NOT relevant

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
              aiValidationRan = true;
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

    // === PHASE 3.5: Gemini AI Deal Analysis ===
    let geminiAnalysis: {
      dealSummary?: { summary: string };
      priceAnalysis?: {
        bestDeal: { platform: string; price: number; name: string };
        recommendation: string;
        confidence: number;
        priceInsight: string;
        shouldBuy: boolean;
      };
      dealScore?: number;
      error?: string;
    } = {};

    const priceResults = results.filter(r => r.price && r.price > 0);
    if (priceResults.length >= 1) {
      try {
        const productsForAI = priceResults.map(r => ({
          platform: r.platform,
          price: r.price!,
          name: r.name,
        }));

        // Run both Gemini calls in parallel
        const [summaryResult, analysisResult] = await Promise.allSettled([
          generateDealSummary(productsForAI),
          cleanedQuery ? analyzeScrapedPrices(cleanedQuery, productsForAI) : Promise.resolve(null),
        ]);

        if (summaryResult.status === "fulfilled") {
          geminiAnalysis.dealSummary = summaryResult.value;
        }
        if (analysisResult.status === "fulfilled" && analysisResult.value) {
          geminiAnalysis.priceAnalysis = analysisResult.value;
        }

        // Calculate deal score from price spread (0-100)
        // Narrow spread = competitive market = good for buyers = higher score
        const prices = productsForAI.map(p => p.price).sort((a, b) => a - b);
        if (prices.length >= 2) {
          const lowest = prices[0];
          const highest = prices[prices.length - 1];
          const spread = highest - lowest;
          const spreadPercent = (spread / highest) * 100;
          // Score: 100 = no spread (all same price), 0 = huge spread (100%+)
          geminiAnalysis.dealScore = Math.max(0, Math.round(100 - spreadPercent));
        } else {
          geminiAnalysis.dealScore = 50; // Single result, neutral score
        }
      } catch (e) {
        geminiAnalysis.error = e instanceof Error ? e.message : "Gemini analysis failed";
      }
    }

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
            const pName = String(p.name ?? "").toLowerCase();
            const rName = r.name.toLowerCase();
            // Match on first 5 words for better accuracy (3 words was too broad)
            const pWords = pName.split(/\s+/).filter(w => w.length > 1).slice(0, 5).join(" ");
            const rWords = rName.split(/\s+/).filter(w => w.length > 1).slice(0, 5).join(" ");
            if (!pWords || !rWords) return false;
            // Check URL domain match if product has a stored URL
            const pUrl = String(p.url ?? "").toLowerCase();
            const rUrl = r.url.toLowerCase();
            let sameDomain = false;
            try { sameDomain = !!(pUrl && rUrl && new URL(pUrl).hostname === new URL(rUrl).hostname); } catch {}
            // Require domain match (if URLs available) AND name overlap on first 5 words
            const nameMatch = pWords === rWords || pName.includes(rWords) || rName.includes(pWords);
            return sameDomain ? nameMatch : (pWords === rWords);
          });
          if (existing) {
            const updates: Record<string, unknown> = { current_price: r.price, last_checked: r.scrapedAt };
            if (r.price < (Number(existing.lowest_price) || Infinity)) updates.lowest_price = r.price;
            if (r.price > (Number(existing.highest_price) || 0)) updates.highest_price = r.price;
            update("products", String(existing.id), updates);
            create("price_history", { product_id: existing.id, price: r.price, currency: "INR", recorded_at: r.scrapedAt });
          }
        }
      }
    } catch {}

    // === PHASE 6: Send Rich Telegram Notification ===
    try {
      const settings = getSettings();
      const chatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || "";
      const botToken = process.env.TELEGRAM_BOT_TOKEN || settings.telegram_bot_token || "";
      if (chatId && botToken) {
        const sortedPriceLines = results
          .filter(r => r.price)
          .sort((a, b) => a.price! - b.price!)
          .map((r, i) => `${i === 0 ? "🏆" : "  •"} ${r.platform}: ₹${r.price!.toLocaleString("en-IN")}${i === 0 ? " (BEST)" : ""}`);
        const failedSites = results.filter(r => !r.price).map(r => r.platform);

        let msg = `🔍 *Search:* ${url ?? query}\n`;
        msg += `⏱ *Duration:* ${(durationMs / 1000).toFixed(1)}s\n`;
        msg += `📊 *Sites:* ${successCount}/${results.length} returned prices\n\n`;

        msg += `💰 *Prices (best to worst):*\n`;
        msg += sortedPriceLines.join("\n") + "\n";

        if (failedSites.length > 0) {
          msg += `\n❌ *Failed:* ${failedSites.join(", ")}\n`;
        }

        if (geminiAnalysis.dealScore !== undefined) {
          msg += `\n📈 *Deal Score:* ${geminiAnalysis.dealScore}/100`;
          if (geminiAnalysis.dealScore >= 70) msg += " (Great!)";
          else if (geminiAnalysis.dealScore >= 40) msg += " (Decent)";
          else msg += " (Wide spread)";
          msg += "\n";
        }

        if (geminiAnalysis.priceAnalysis) {
          const pa = geminiAnalysis.priceAnalysis;
          msg += `\n🤖 *AI Recommendation:*\n${pa.recommendation}\n`;
          msg += `💡 *Insight:* ${pa.priceInsight}\n`;
          msg += `🎯 *Confidence:* ${pa.confidence}% — ${pa.shouldBuy ? "BUY NOW ✅" : "WAIT ⏳"}\n`;
        } else if (geminiAnalysis.dealSummary) {
          msg += `\n🤖 *AI Summary:*\n${geminiAnalysis.dealSummary.summary}\n`;
        }

        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
        }).catch(() => {});
      }
    } catch {}

    return corsJson({
      message: "Scrape completed",
      duration_ms: durationMs,
      results,
      ai_validated: aiValidationRan,
      gemini_analysis: geminiAnalysis,
    });
  } catch {
    scraperStatus.running = false;
    return corsError("Scrape failed", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
