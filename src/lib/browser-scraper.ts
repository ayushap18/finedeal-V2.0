import { ScrapeResult } from "./scraper";

let playwrightAvailable = true;

/**
 * Scrape a site using a headless browser (Playwright Chromium).
 * Falls back gracefully if Playwright is not available.
 */
export async function scrapeWithBrowser(url: string, platform: string): Promise<ScrapeResult> {
  if (!playwrightAvailable) {
    return { name: "Unknown", price: null, platform, url, scrapedAt: new Date().toISOString(), error: "Browser scraping not available" };
  }

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "en-IN",
        viewport: { width: 1366, height: 768 },
      });
      const page = await context.newPage();

      // Block images/fonts/media for speed
      await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,webm}", (route) => route.abort());

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      // Wait a bit for JS to render prices
      await page.waitForTimeout(2000);

      const html = await page.content();
      const title = await page.title();

      // Extract price using multiple strategies
      let price: number | null = null;
      let productName = title.split("|")[0].split("-")[0].trim() || "Unknown";

      // Try common price selectors
      const priceSelectors = [
        // Flipkart
        "div.Nx9bqj", "div._30jeq3", "div._16Jk6d",
        // Croma
        "span.amount", "span.pdpPrice", "span.new-price",
        // AJIO
        "span.prod-sp", "span.prod-discnt-price",
        // Vijay Sales
        "span.product-price", "span.price",
        // Generic
        "[class*='price']", "[class*='Price']", "[data-price]",
      ];

      for (const sel of priceSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            const text = await el.textContent();
            if (text) {
              const cleaned = text.replace(/[₹,\s]/g, "").replace(/Rs\.?/gi, "").trim();
              const num = parseFloat(cleaned);
              if (!isNaN(num) && num > 100 && num < 10000000) {
                price = num;
                break;
              }
            }
          }
        } catch { continue; }
      }

      // Try extracting from page data attributes or JSON-LD
      if (!price) {
        try {
          const jsonLd = await page.$eval('script[type="application/ld+json"]', (el) => el.textContent);
          if (jsonLd) {
            const parsed = JSON.parse(jsonLd);
            const offers = parsed.offers || parsed;
            const offerPrice = offers.price || offers.lowPrice || offers.highPrice;
            if (offerPrice) price = parseFloat(offerPrice);
            if (parsed.name) productName = parsed.name;
          }
        } catch { /* no JSON-LD */ }
      }

      // Fallback: regex on HTML for amounts
      if (!price) {
        const priceMatch = html.match(/₹\s*([\d,]+(?:\.\d{2})?)/);
        if (priceMatch) {
          const num = parseFloat(priceMatch[1].replace(/,/g, ""));
          if (num > 100 && num < 10000000) price = num;
        }
      }

      // Try to get a better product name
      const nameSelectors = [
        "h1", "span.VU-ZEz", "span.B_NuCI", "h1.pdp-title",
        "h1.prod-name", "h1.product-title", "h1.pd-title",
      ];
      for (const sel of nameSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            const text = await el.textContent();
            if (text && text.trim().length > 3 && text.trim().length < 200) {
              productName = text.trim();
              break;
            }
          }
        } catch { continue; }
      }

      await browser.close();

      return {
        name: productName,
        price,
        platform,
        url,
        scrapedAt: new Date().toISOString(),
        error: price ? undefined : "Price not found even with browser rendering",
      };
    } catch (err) {
      await browser.close();
      throw err;
    }
  } catch (err) {
    if (String(err).includes("Cannot find module") || String(err).includes("playwright")) {
      playwrightAvailable = false;
      return { name: "Unknown", price: null, platform, url, scrapedAt: new Date().toISOString(), error: "Playwright not installed" };
    }
    return {
      name: "Unknown",
      price: null,
      platform,
      url,
      scrapedAt: new Date().toISOString(),
      error: `Browser scrape failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Search for a product on a site using browser rendering.
 */
export async function searchWithBrowser(query: string, platform: string): Promise<ScrapeResult> {
  const searchUrls: Record<string, string> = {
    flipkart: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    croma: `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`,
    ajio: `https://www.ajio.com/search/?text=${encodeURIComponent(query)}`,
    vijaysales: `https://www.vijaysales.com/search?q=${encodeURIComponent(query)}`,
  };

  const url = searchUrls[platform.toLowerCase()];
  if (!url) {
    return { name: query, price: null, platform, url: "", scrapedAt: new Date().toISOString(), error: `No browser search URL for ${platform}` };
  }

  const displayNames: Record<string, string> = {
    flipkart: "Flipkart", croma: "Croma", ajio: "AJIO", vijaysales: "Vijay Sales",
  };

  const result = await scrapeWithBrowser(url, displayNames[platform.toLowerCase()] || platform);
  if (!result.name || result.name === "Unknown") result.name = query;
  return result;
}
