import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { getAll, create, update, getSettings } from "@/lib/db";
import { searchProduct, ScrapeResult } from "@/lib/scraper";

export async function GET() {
  try {
    const products = getAll("products");
    const tracking = products.filter(p => p.status === "tracking");
    const startTime = Date.now();
    let updated = 0, errors = 0;

    // Group products by name to avoid duplicate searches
    const uniqueNames = [...new Set(tracking.map(p => String(p.name)))].slice(0, 20);

    for (const name of uniqueNames) {
      try {
        const results: ScrapeResult[] = await searchProduct(name, ["amazon", "flipkart", "snapdeal"]);
        const validResults = results.filter(r => r.price && r.price > 0);

        if (validResults.length > 0) {
          // Update all products matching this name
          const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 5).join(" ");
          const matchingProducts = tracking.filter(p => {
            const pWords = String(p.name ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 5).join(" ");
            return pWords && nameWords && (pWords === nameWords || pWords.includes(nameWords) || nameWords.includes(pWords));
          });

          for (const product of matchingProducts) {
            const bestResult = validResults[0];
            const updates: Record<string, unknown> = {
              current_price: bestResult.price,
              last_checked: new Date().toISOString(),
            };
            if (bestResult.price! < (Number(product.lowest_price) || Infinity)) updates.lowest_price = bestResult.price;
            if (bestResult.price! > (Number(product.highest_price) || 0)) updates.highest_price = bestResult.price;

            update("products", String(product.id), updates);
            create("price_history", {
              product_id: product.id,
              price: bestResult.price,
              currency: "INR",
              recorded_at: new Date().toISOString(),
            });
            updated++;
          }
        }
      } catch {
        errors++;
      }
    }

    const durationMs = Date.now() - startTime;

    create("system_logs", {
      level: updated > 0 ? "success" : "warning",
      message: `Auto-scrape: ${updated} products updated, ${errors} errors [${(durationMs / 1000).toFixed(1)}s]`,
      source: "cron",
    });

    // Send Telegram notification
    try {
      const settings = getSettings();
      const chatId = settings.telegram_chat_id;
      const botToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
      if (chatId && botToken) {
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Auto-Scrape Complete\n\n${updated} products updated\n${errors} errors\n${(durationMs / 1000).toFixed(1)}s\n\n${uniqueNames.slice(0, 5).join("\n")}`,
          }),
        }).catch(() => {});
      }
    } catch {}

    return corsJson({
      message: "Auto-scrape completed",
      products_checked: uniqueNames.length,
      updated,
      errors,
      duration_ms: durationMs,
    });
  } catch (e) {
    return corsError(`Auto-scrape failed: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
