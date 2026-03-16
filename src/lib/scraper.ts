// Real web scraper for Indian e-commerce platforms

export interface ScrapeResult {
  name: string;
  price: number | null;
  platform: string;
  url: string;
  scrapedAt: string;
  error?: string;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

const FETCH_TIMEOUT = 10000;
const MAX_RETRIES = 2;

type PlatformKey = "amazon" | "flipkart" | "croma" | "myntra" | "ajio" | "snapdeal" | "tatacliq" | "nykaa" | "vijaysales";

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Platform-specific headers to avoid blocks
function getHeaders(platform: PlatformKey | null): Record<string, string> {
  const ua = randomUA();
  const base: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  // Amazon needs a referrer
  if (platform === "amazon") {
    base["Referer"] = "https://www.google.com/";
  }
  // Flipkart needs specific headers
  if (platform === "flipkart") {
    base["Referer"] = "https://www.google.com/";
    base["Sec-Fetch-Site"] = "cross-site";
  }
  // AJIO
  if (platform === "ajio") {
    base["Referer"] = "https://www.google.com/";
  }

  return base;
}

// --- Platform detection ---

function detectPlatform(url: string): PlatformKey | null {
  const host = url.toLowerCase();
  if (host.includes("amazon.in") || host.includes("amazon.com")) return "amazon";
  if (host.includes("flipkart.com")) return "flipkart";
  if (host.includes("croma.com")) return "croma";
  if (host.includes("myntra.com")) return "myntra";
  if (host.includes("ajio.com")) return "ajio";
  if (host.includes("snapdeal.com")) return "snapdeal";
  if (host.includes("tatacliq.com")) return "tatacliq";
  if (host.includes("nykaa.com")) return "nykaa";
  if (host.includes("vijaysales.com")) return "vijaysales";
  return null;
}

// --- HTML fetch with timeout + retries ---

async function fetchHtml(url: string, platform: PlatformKey | null = null): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      // Add small random delay between retries to avoid rate limits
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
      }

      const res = await fetch(url, {
        headers: getHeaders(platform),
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry on 403/429 — likely blocked
      if (lastError.message.includes("403") || lastError.message.includes("429")) {
        break;
      }
    }
  }

  throw lastError ?? new Error("Fetch failed");
}

// --- Price parsing helpers ---

function cleanPrice(raw: string): number | null {
  // Remove ₹, commas, spaces, and currency words
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/Rs\.?/gi, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractFirst(html: string, pattern: RegExp): string | null {
  const m = pattern.exec(html);
  return m ? m[1].trim() : null;
}

// --- Platform-specific extractors ---

function extractAmazon(html: string, url: string): ScrapeResult {
  // Title: <span id="productTitle">...</span>
  const name =
    extractFirst(html, /<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";

  // Price: <span class="a-price-whole">1,299</span>
  const priceRaw =
    extractFirst(html, /<span[^>]*class="a-price-whole"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="a-offscreen"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*id="priceblock_dealprice"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*id="priceblock_ourprice"[^>]*>([^<]+)<\/span>/i);

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Amazon.in",
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function extractFlipkart(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<span[^>]*class="[^"]*VU-ZEz[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*B_NuCI[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";

  const priceRaw =
    extractFirst(html, /<div[^>]*class="[^"]*_30jeq3[^"]*"[^>]*>([^<]+)<\/div>/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*_16Jk6d[^"]*"[^>]*>([^<]+)<\/div>/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*Nx9bqj[^"]*"[^>]*>([^<]+)<\/div>/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*_25b18c[^"]*"[^>]*>[\s\S]*?<div[^>]*>([^<]+)<\/div>/i);

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Flipkart",
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function extractCroma(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*pd-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";

  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*amount[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*pdpPrice[^"]*"[^>]*>([^<]+)<\/span>/i);

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Croma",
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function extractMyntra(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*pdp-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";

  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*pdp-price[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*pdp-discountedPrice[^"]*"[^>]*>([^<]+)<\/span>/i);

  return {
    name: name.replace(/\s+/g, " ").trim(),
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Myntra",
    url,
    scrapedAt: new Date().toISOString(),
  };
}

function extractAjio(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*prod-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*prod-sp[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*price[^"]*"[^>]*>₹([^<]+)<\/span>/i);
  return { name: name.replace(/\s+/g, " ").trim(), price: priceRaw ? cleanPrice(priceRaw) : null, platform: "AJIO", url, scrapedAt: new Date().toISOString() };
}

function extractSnapdeal(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*pdp-e-i-head[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*payBlkBig[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*itemprop="price"[^>]*>([^<]+)<\/span>/i);
  return { name: name.replace(/\s+/g, " ").trim(), price: priceRaw ? cleanPrice(priceRaw) : null, platform: "Snapdeal", url, scrapedAt: new Date().toISOString() };
}

function extractNykaa(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*post-card__content-price-offer[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*price[^"]*"[^>]*>₹([^<]+)<\/span>/i);
  return { name: name.replace(/\s+/g, " ").trim(), price: priceRaw ? cleanPrice(priceRaw) : null, platform: "Nykaa", url, scrapedAt: new Date().toISOString() };
}

function extractTataCliq(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*ProductDescription[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*ProductPrice[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)<\/div>/i);
  return { name: name.replace(/\s+/g, " ").trim(), price: priceRaw ? cleanPrice(priceRaw) : null, platform: "Tata CLiQ", url, scrapedAt: new Date().toISOString() };
}

function extractVijaySales(html: string, url: string): ScrapeResult {
  const name =
    extractFirst(html, /<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ??
    extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    "Unknown Product";
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*product-price[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*price[^"]*"[^>]*>₹([^<]+)<\/span>/i);
  return { name: name.replace(/\s+/g, " ").trim(), price: priceRaw ? cleanPrice(priceRaw) : null, platform: "Vijay Sales", url, scrapedAt: new Date().toISOString() };
}

// --- Public API ---

/**
 * Scrape a single product URL. Detects the platform automatically.
 */
export async function scrapeProduct(url: string): Promise<ScrapeResult> {
  const platform = detectPlatform(url);
  if (!platform) {
    return {
      name: "Unknown",
      price: null,
      platform: "unsupported",
      url,
      scrapedAt: new Date().toISOString(),
      error: "Unsupported platform. Supported: Amazon.in, Flipkart, Croma, Myntra, AJIO, Snapdeal, Tata CLiQ, Nykaa, Vijay Sales",
    };
  }

  try {
    const html = await fetchHtml(url, platform);

    const extractors: Record<PlatformKey, (h: string, u: string) => ScrapeResult> = {
      amazon: extractAmazon,
      flipkart: extractFlipkart,
      croma: extractCroma,
      myntra: extractMyntra,
      ajio: extractAjio,
      snapdeal: extractSnapdeal,
      tatacliq: extractTataCliq,
      nykaa: extractNykaa,
      vijaysales: extractVijaySales,
    };

    const result = extractors[platform](html, url);

    if (result.price === null) {
      result.error = "Price not found in page HTML — site may require JS rendering";
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "Unknown",
      price: null,
      platform,
      url,
      scrapedAt: new Date().toISOString(),
      error: `Scrape failed: ${message}`,
    };
  }
}

// --- Search URL builders ---

const SEARCH_URLS: Record<PlatformKey, (q: string) => string> = {
  amazon: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
  croma: (q) => `https://www.croma.com/search/?text=${encodeURIComponent(q)}`,
  myntra: (q) => `https://www.myntra.com/${encodeURIComponent(q.replace(/\s+/g, "-"))}`,
  ajio: (q) => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}&classifier=intent`,
  snapdeal: (q) => `https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}`,
  tatacliq: (q) => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(q)}`,
  nykaa: (q) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`,
  vijaysales: (q) => `https://www.vijaysales.com/catalogsearch/result?q=${encodeURIComponent(q)}`,
};

// Extract first result from search pages

function parseAmazonSearch(html: string, query: string): ScrapeResult {
  // Look for first product in search results
  const nameRaw =
    extractFirst(
      html,
      /<span[^>]*class="a-size-medium[^"]*a-text-normal[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    ) ??
    extractFirst(
      html,
      /<span[^>]*class="a-size-base-plus[^"]*a-text-normal[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );

  const priceRaw =
    extractFirst(html, /<span[^>]*class="a-price-whole"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="a-offscreen"[^>]*>([^<]+)<\/span>/i);

  const linkMatch = /\/dp\/([A-Z0-9]{10})/.exec(html);
  const productUrl = linkMatch
    ? `https://www.amazon.in/dp/${linkMatch[1]}`
    : `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;

  return {
    name: nameRaw?.replace(/\s+/g, " ").trim() ?? query,
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Amazon.in",
    url: productUrl,
    scrapedAt: new Date().toISOString(),
  };
}

function parseFlipkartSearch(html: string, query: string): ScrapeResult {
  const nameRaw =
    extractFirst(html, /<a[^>]*class="[^"]*wjcEIp[^"]*"[^>]*title="([^"]+)"/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*KzDlHZ[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
    extractFirst(html, /<a[^>]*class="[^"]*s1Q9rs[^"]*"[^>]*title="([^"]+)"/i);

  const priceRaw =
    extractFirst(html, /<div[^>]*class="[^"]*Nx9bqj[^"]*"[^>]*>([^<]+)<\/div>/i) ??
    extractFirst(html, /<div[^>]*class="[^"]*_30jeq3[^"]*"[^>]*>([^<]+)<\/div>/i);

  return {
    name: nameRaw?.replace(/\s+/g, " ").trim() ?? query,
    price: priceRaw ? cleanPrice(priceRaw) : null,
    platform: "Flipkart",
    url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    scrapedAt: new Date().toISOString(),
  };
}

function parseGenericSearch(html: string, query: string, platform: string, url: string): ScrapeResult {
  // Extract ALL products with their names and prices from the HTML
  // Look for patterns where product name and price appear near each other
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Strategy 1: Find all ₹-prefixed prices and nearby text
  const priceBlocks: { name: string; price: number; relevance: number }[] = [];
  const priceRegex = /₹\s*([\d,]+(?:\.\d{2})?)/g;
  let priceMatch;

  while ((priceMatch = priceRegex.exec(html)) !== null) {
    const price = cleanPrice(priceMatch[1]);
    if (!price || price < 50 || price > 10000000) continue;

    // Get surrounding text (500 chars before the price) to find product name
    const contextStart = Math.max(0, priceMatch.index - 500);
    const context = html.substring(contextStart, priceMatch.index);

    // Remove HTML tags to get plain text
    const plainText = context.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Check how many query words match in the context
    const lowerContext = plainText.toLowerCase();
    const matchCount = queryWords.filter(w => lowerContext.includes(w)).length;
    const relevance = matchCount / queryWords.length;

    if (relevance > 0.3) {
      // Extract a reasonable product name from context
      const nameMatch = plainText.match(/([A-Z][A-Za-z0-9\s\-\+\/\(\),.]+)/);
      const name = nameMatch ? nameMatch[1].trim().substring(0, 100) : query;

      priceBlocks.push({ name, price, relevance });
    }
  }

  // Sort by relevance (how well the surrounding text matches the query)
  priceBlocks.sort((a, b) => b.relevance - a.relevance);

  if (priceBlocks.length > 0) {
    const best = priceBlocks[0];
    return {
      name: best.name || query,
      price: best.price,
      platform,
      url,
      scrapedAt: new Date().toISOString(),
    };
  }

  // Fallback: just get title and first reasonable price
  const title = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? query;
  const cleanTitle = title.replace(/\s+/g, " ").replace(/ - .*$| \| .*$| Buy .*$/i, "").trim();

  // Get all prices and pick the most reasonable one (not too cheap, not first random one)
  const allPrices: number[] = [];
  const priceRegex2 = /₹\s*([\d,]+)/g;
  let m2;
  while ((m2 = priceRegex2.exec(html)) !== null) {
    const p = cleanPrice(m2[1]);
    if (p && p > 100 && p < 10000000) allPrices.push(p);
  }

  // Pick the median price (most likely to be the actual product, not accessories or shipping)
  allPrices.sort((a, b) => a - b);
  const medianPrice = allPrices.length > 0 ? allPrices[Math.floor(allPrices.length / 2)] : null;

  return {
    name: cleanTitle,
    price: medianPrice,
    platform,
    url,
    scrapedAt: new Date().toISOString(),
    error: medianPrice ? undefined : "No matching price found",
  };
}

// --- Flipkart Internal API (bypasses HTML scraping blocks) ---

async function searchFlipkartAPI(query: string): Promise<ScrapeResult> {
  const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;

  // Try Playwright browser first (most reliable for Flipkart)
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    const result = await searchWithBrowser(query, "flipkart");
    if (result.price && result.price > 0) return result;
  } catch { /* fall through to API */ }

  // Fallback: Flipkart internal API
  try {
    const res = await fetch("https://2.rome.api.flipkart.com/api/4/page/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Agent": "Mozilla/5.0 FKUA/website/42/website/Desktop",
        "User-Agent": randomUA(),
      },
      body: JSON.stringify({
        pageUri: `/search?q=${encodeURIComponent(query)}`,
        pageContext: { fetchSeoData: false },
        requestContext: { type: "BROWSE_PAGE" },
      }),
    });

    if (!res.ok) throw new Error(`Flipkart API ${res.status}`);
    const text = await res.text();

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const nameMatches = text.match(/"title":\{"value":"([^"]+)"/g) || [];
    const priceMatches = text.match(/"finalPrice":\{"decimalValue":"(\d+)"/g) || [];

    let bestPrice: number | null = null;
    let bestName = query;
    let bestRelevance = 0;

    const names = nameMatches.map(m => { const r = m.match(/"value":"([^"]+)"/); return r?.[1] ?? ""; }).filter(n => n.length > 5);
    const prices = priceMatches.map(m => { const r = m.match(/"(\d+)"$/); return r ? parseInt(r[1]) : 0; }).filter(p => p > 500);

    for (let i = 0; i < Math.min(names.length, prices.length, 10); i++) {
      const nameLower = names[i].toLowerCase();
      const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
      const relevance = matchCount / queryWords.length;
      if (relevance > bestRelevance && prices[i] > 500) {
        bestRelevance = relevance;
        bestPrice = prices[i];
        bestName = names[i];
      }
    }

    if (!bestPrice && prices.length > 0) {
      bestPrice = prices[0];
      if (names.length > 0) bestName = names[0];
    }

    return {
      name: bestName,
      price: bestPrice,
      platform: "Flipkart",
      url,
      scrapedAt: new Date().toISOString(),
      error: bestPrice ? undefined : "No price in Flipkart response",
    };
  } catch {
    return { name: query, price: null, platform: "Flipkart", url, scrapedAt: new Date().toISOString(), error: "Flipkart search failed" };
  }
}

// --- Croma API search ---

async function searchCromaAPI(query: string): Promise<ScrapeResult> {
  // Try multiple Croma URL patterns
  const urls = [
    `https://www.croma.com/search/?text=${encodeURIComponent(query)}`,
    `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchHtml(url, "croma");
      // Extract prices with multiple patterns
      const priceMatches: number[] = [];
      const priceRegex = /₹\s*([\d,]+)/g;
      let m;
      while ((m = priceRegex.exec(html)) !== null) {
        const p = cleanPrice(m[1]);
        if (p && p > 500 && p < 10000000) priceMatches.push(p);
      }

      // Also try data attributes and JSON
      const jsonPriceMatch = html.match(/"price":\s*"?([\d,]+)"?/);
      if (jsonPriceMatch) {
        const jp = cleanPrice(jsonPriceMatch[1]);
        if (jp && jp > 500) priceMatches.push(jp);
      }

      if (priceMatches.length > 0) {
        // Get median price (most reliable)
        priceMatches.sort((a, b) => a - b);
        const price = priceMatches[Math.floor(priceMatches.length / 2)];

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const name = titleMatch ? titleMatch[1].replace(/ - Croma.*| \| .*| Buy .*/gi, "").trim() : query;

        return { name, price, platform: "Croma", url, scrapedAt: new Date().toISOString() };
      }
    } catch { continue; }
  }

  // Browser fallback
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    return await searchWithBrowser(query, "croma");
  } catch {
    return { name: query, price: null, platform: "Croma", url: urls[0], scrapedAt: new Date().toISOString(), error: "Croma: no prices found" };
  }
}

// --- Vijay Sales search ---

async function searchVijaySales(query: string): Promise<ScrapeResult> {
  // Try the correct Vijay Sales search URL
  const urls = [
    `https://www.vijaysales.com/search?q=${encodeURIComponent(query)}`,
    `https://www.vijaysales.com/catalogsearch/result?q=${encodeURIComponent(query)}`,
    `https://www.vijaysales.com/search/${encodeURIComponent(query.replace(/\s+/g, "+"))}`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchHtml(url, "vijaysales");
      const priceRaw =
        extractFirst(html, /₹\s*([\d,]+)/i) ??
        extractFirst(html, /<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)<\/span>/i) ??
        extractFirst(html, /"price":\s*"?([\d,]+)"?/i);
      const nameRaw = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? query;

      if (priceRaw) {
        const price = cleanPrice(priceRaw);
        if (price && price > 100) {
          return {
            name: nameRaw.replace(/\s+/g, " ").replace(/ - Vijay Sales.*$/i, "").trim(),
            price,
            platform: "Vijay Sales",
            url,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    } catch { continue; }
  }

  // Fallback to browser
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    return await searchWithBrowser(query, "vijaysales");
  } catch {
    return { name: query, price: null, platform: "Vijay Sales", url: urls[0], scrapedAt: new Date().toISOString(), error: "Vijay Sales scraping failed" };
  }
}

// --- AJIO API search ---

async function searchAjioAPI(query: string): Promise<ScrapeResult> {
  try {
    // AJIO has a JSON API
    const url = `https://www.ajio.com/api/search?fields=SITE&currentPage=0&pageSize=5&format=json&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json",
        "Referer": "https://www.ajio.com/",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const products = data.products || [];
      if (products.length > 0) {
        const p = products[0];
        return {
          name: p.fnlColorVariantData?.productName || p.name || query,
          price: p.price?.value || p.warehousePrice?.value || null,
          platform: "AJIO",
          url: `https://www.ajio.com${p.url || ""}`,
          scrapedAt: new Date().toISOString(),
        };
      }
    }
  } catch { /* fall through */ }

  // Fallback to browser
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    return await searchWithBrowser(query, "ajio");
  } catch {
    return { name: query, price: null, platform: "AJIO", url: `https://www.ajio.com/search/?text=${encodeURIComponent(query)}`, scrapedAt: new Date().toISOString(), error: "AJIO scraping failed" };
  }
}

/**
 * Search for a product across multiple platforms.
 * Uses API-based search for blocked sites, HTML scraping for others.
 */
export async function searchProduct(
  name: string,
  platforms: string[] = ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"]
): Promise<ScrapeResult[]> {
  const validPlatforms = platforms
    .map((p) => p.toLowerCase().trim() as PlatformKey)
    .filter((p) => p in SEARCH_URLS);

  if (validPlatforms.length === 0) {
    return [{ name, price: null, platform: "none", url: "", scrapedAt: new Date().toISOString(), error: "No valid platforms" }];
  }

  const tasks = validPlatforms.map(async (platform): Promise<ScrapeResult> => {
    // Use API-based search for sites that block HTML scraping
    if (platform === "flipkart") return searchFlipkartAPI(name);
    if (platform === "croma") return searchCromaAPI(name);
    if (platform === "vijaysales") return searchVijaySales(name);
    if (platform === "ajio") return searchAjioAPI(name);

    const searchUrl = SEARCH_URLS[platform](name);
    try {
      const html = await fetchHtml(searchUrl, platform);

      if (platform === "amazon") return parseAmazonSearch(html, name);

      const displayNames: Record<string, string> = {
        croma: "Croma", myntra: "Myntra", ajio: "AJIO", snapdeal: "Snapdeal",
        tatacliq: "Tata CLiQ", nykaa: "Nykaa", vijaysales: "Vijay Sales",
      };
      return parseGenericSearch(html, name, displayNames[platform] || platform, searchUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { name, price: null, platform, url: searchUrl, scrapedAt: new Date().toISOString(), error: `Search failed: ${message}` };
    }
  });

  return Promise.all(tasks);
}

/**
 * Fallback: Use Google Shopping results to find prices when direct scraping fails.
 * This is a last resort for sites that block direct server-side requests.
 */
export async function searchViaGoogle(productName: string): Promise<ScrapeResult[]> {
  const query = encodeURIComponent(`${productName} price India buy`);
  const url = `https://www.google.com/search?q=${query}&gl=in&hl=en`;

  try {
    const html = await fetchHtml(url, null);
    const results: ScrapeResult[] = [];

    // Extract prices from Google search results
    const pricePattern = /₹[\s]*[\d,]+(?:\.\d{2})?/g;
    const prices = html.match(pricePattern) || [];

    // Extract site mentions
    const sitePatterns: { pattern: RegExp; platform: string }[] = [
      { pattern: /amazon\.in/gi, platform: "Amazon.in" },
      { pattern: /flipkart\.com/gi, platform: "Flipkart" },
      { pattern: /ajio\.com/gi, platform: "AJIO" },
      { pattern: /vijaysales\.com/gi, platform: "Vijay Sales" },
    ];

    for (const sp of sitePatterns) {
      if (sp.pattern.test(html) && prices.length > 0) {
        const priceStr = prices[0]!;
        const price = cleanPrice(priceStr);
        if (price && price > 100) {
          results.push({
            name: productName,
            price,
            platform: sp.platform,
            url: `https://www.google.com/search?q=${encodeURIComponent(productName + " " + sp.platform)}`,
            scrapedAt: new Date().toISOString(),
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}
