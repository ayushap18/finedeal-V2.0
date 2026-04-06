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

  // Try multiple price extraction strategies for Croma
  const priceRaw =
    extractFirst(html, /<span[^>]*class="[^"]*amount[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    extractFirst(html, /<span[^>]*class="[^"]*pdpPrice[^"]*"[^>]*>([^<]+)<\/span>/i) ??
    // Croma embeds prices in script/__NEXT_DATA__ JSON
    extractFirst(html, /"sellingPrice"\s*:\s*"?([\d,]+)"?/i) ??
    extractFirst(html, /"price"\s*:\s*"?([\d,]+)"?/i) ??
    extractFirst(html, /"offerPrice"\s*:\s*"?([\d,]+)"?/i);

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
  vijaysales: (q) => `https://www.vijaysales.com/search/-/results?q=${encodeURIComponent(q)}&category=all`,
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

  // Strategy 0: Extract prices from embedded JSON (ld+json, __NEXT_DATA__, script data)
  // This is the most reliable method for modern SPA e-commerce sites
  const jsonPricePatterns = [
    /"sellingPrice"\s*:\s*"?([\d,]+)"?/g,
    /"offerPrice"\s*:\s*"?([\d,]+)"?/g,
    /"finalPrice"\s*:\s*"?([\d,]+)"?/g,
    /"special_price"\s*:\s*"?([\d,]+)"?/g,
  ];
  const jsonPrices: number[] = [];
  for (const pattern of jsonPricePatterns) {
    let jm;
    while ((jm = pattern.exec(html)) !== null) {
      const jp = cleanPrice(jm[1]);
      if (jp && jp > 100 && jp < 10000000) jsonPrices.push(jp);
    }
  }
  if (jsonPrices.length > 0) {
    jsonPrices.sort((a, b) => a - b);
    const price = jsonPrices[Math.floor(jsonPrices.length / 2)];
    const nameMatch = html.match(/"productName"\s*:\s*"([^"]+)"/i) ??
      html.match(/"name"\s*:\s*"([^"]+)"/i);
    const title = nameMatch ? nameMatch[1] : (extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? query);
    return {
      name: title.replace(/\s+/g, " ").replace(/ - .*$| \| .*$/i, "").trim(),
      price,
      platform,
      url,
      scrapedAt: new Date().toISOString(),
    };
  }

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

  // Strategy 1: Flipkart Rome API (most reliable, bypasses 403)
  try {
    const res = await fetch("https://2.rome.api.flipkart.com/api/4/page/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Agent": "Mozilla/5.0 FKUA/website/42/website/Desktop",
        "User-Agent": randomUA(),
        "Accept": "*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Origin": "https://www.flipkart.com",
        "Referer": "https://www.flipkart.com/",
      },
      body: JSON.stringify({
        pageUri: `/search?q=${encodeURIComponent(query)}`,
        pageContext: { fetchSeoData: false },
        requestContext: { type: "BROWSE_PAGE" },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!res.ok) throw new Error(`Flipkart API ${res.status}`);
    const text = await res.text();

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    interface FlipkartProduct { name: string; price: number; productUrl: string }
    const products: FlipkartProduct[] = [];

    // Strategy A: Parse structured JSON (most reliable)
    // Rome API returns RESPONSE.slots[] with widget.type === "PRODUCT_SUMMARY"
    // Each has widget.data.products[].productInfo.value.{titles, pricing}
    try {
      const json = JSON.parse(text);
      const slots = json?.RESPONSE?.slots ?? [];
      for (const slot of slots) {
        const widget = slot?.widget;
        if (widget?.type !== "PRODUCT_SUMMARY") continue;
        const prods = widget?.data?.products ?? [];
        for (const p of prods) {
          const val = p?.productInfo?.value;
          if (!val) continue;
          const title = val.titles?.title ?? val.titles?.newTitle ?? "";
          const price = val.pricing?.finalPrice?.value ?? parseFloat(val.pricing?.finalPrice?.decimalValue ?? "0");
          const productUrl = val.baseUrl ? `https://www.flipkart.com${val.baseUrl}` : "";
          if (title && price > 0) {
            products.push({ name: title, price: Math.round(price), productUrl });
          }
        }
        if (products.length >= 15) break;
      }
    } catch { /* JSON parse failed, fall through to regex */ }

    // Strategy B: Regex fallback if JSON parsing yielded no products
    if (products.length === 0) {
      // "titles" object contains "title":"Full Product Name" — avoids filter labels
      const namePattern = /"titles":\{[^}]*"title":"([^"]+)"/g;
      // finalPrice contains "value":<integer> — direct price without decimals
      const pricePattern = /"finalPrice":\{[^}]*"value":(\d+)/g;

      const names: string[] = [];
      let m;
      while ((m = namePattern.exec(text)) !== null) {
        if (m[1].length > 5) names.push(m[1]);
      }

      const prices: number[] = [];
      while ((m = pricePattern.exec(text)) !== null) {
        const p = parseInt(m[1], 10);
        if (p > 100) prices.push(p);
      }

      for (let i = 0; i < Math.min(names.length, prices.length, 15); i++) {
        products.push({ name: names[i], price: prices[i], productUrl: "" });
      }
    }

    // Find best matching product by query relevance
    let bestPrice: number | null = null;
    let bestName = query;
    let bestRelevance = 0;

    for (const p of products) {
      const nameLower = p.name.toLowerCase();
      const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
      const relevance = matchCount / queryWords.length;
      if (relevance > bestRelevance && p.price > 100) {
        bestRelevance = relevance;
        bestPrice = p.price;
        bestName = p.name;
      }
    }

    // If no name matched well, just pick the first product
    if (!bestPrice && products.length > 0) {
      bestPrice = products[0].price;
      bestName = products[0].name;
    }

    return {
      name: bestName,
      price: bestPrice,
      platform: "Flipkart",
      url,
      scrapedAt: new Date().toISOString(),
      error: bestPrice ? undefined : "No price in Flipkart response",
    };
  } catch { /* fall through to browser */ }

  // Strategy 2: Playwright browser (handles JS rendering)
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    const result = await searchWithBrowser(query, "flipkart");
    if (result.price && result.price > 0) return result;
  } catch { /* fall through */ }

  return { name: query, price: null, platform: "Flipkart", url, scrapedAt: new Date().toISOString(), error: "Flipkart search failed - all strategies exhausted" };
}

// --- Croma API search ---

async function searchCromaAPI(query: string): Promise<ScrapeResult> {
  const searchUrl = `https://www.croma.com/search/?text=${encodeURIComponent(query)}`;

  // Strategy 1: Browser scraper (most reliable - Croma uses Akamai WAF)
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    const result = await searchWithBrowser(query, "croma");
    if (result.price && result.price > 0) return result;
  } catch { /* fall through */ }

  // Strategy 2: Try Croma's product search REST API
  try {
    const apiUrl = `https://api.croma.com/productsearch/v2/search?doubleEncoded=false&query=${encodeURIComponent(query)}&sortBy=relevance&pageIndex=0&pageSize=5`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://www.croma.com",
        "Referer": "https://www.croma.com/",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (res.ok) {
      const data = await res.json();
      const products = data.products || data.searchresult?.products || [];
      if (products.length > 0) {
        const p = products[0];
        const price = p.sellingPrice ?? p.price?.value ?? p.offerPrice ?? p.mrp ?? null;
        const name = p.name || p.productName || p.heading || query;
        const productUrl = p.url ? `https://www.croma.com${p.url}` : searchUrl;
        if (price && price > 100) {
          return { name, price, platform: "Croma", url: productUrl, scrapedAt: new Date().toISOString() };
        }
      }
    }
  } catch { /* fall through */ }

  // Strategy 3: HTML scraping with JSON extraction from script tags
  const htmlUrls = [
    `https://www.croma.com/search/?text=${encodeURIComponent(query)}`,
    `https://www.croma.com/searchB?q=${encodeURIComponent(query)}`,
  ];

  for (const url of htmlUrls) {
    try {
      const html = await fetchHtml(url, "croma");
      if (html.length < 1000) continue; // Skip WAF block pages

      const priceMatches: number[] = [];

      // Extract from ₹ symbols in HTML
      const priceRegex = /₹\s*([\d,]+)/g;
      let m;
      while ((m = priceRegex.exec(html)) !== null) {
        const p = cleanPrice(m[1]);
        if (p && p > 500 && p < 10000000) priceMatches.push(p);
      }

      // Extract from JSON in script tags
      const jsonPricePatterns = [
        /"sellingPrice"\s*:\s*"?([\d,]+)"?/g,
        /"offerPrice"\s*:\s*"?([\d,]+)"?/g,
        /"price"\s*:\s*"?([\d,]+)"?/g,
      ];
      for (const pattern of jsonPricePatterns) {
        let jm;
        while ((jm = pattern.exec(html)) !== null) {
          const jp = cleanPrice(jm[1]);
          if (jp && jp > 500 && jp < 10000000) priceMatches.push(jp);
        }
      }

      const nameMatch = html.match(/"productName"\s*:\s*"([^"]+)"/i) ??
        html.match(/"name"\s*:\s*"([^"]+)"/i) ??
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

      if (priceMatches.length > 0) {
        priceMatches.sort((a, b) => a - b);
        const price = priceMatches[Math.floor(priceMatches.length / 2)];
        const name = nameMatch ? nameMatch[1].replace(/ - Croma.*| \| .*| Buy .*/gi, "").trim() : query;
        return { name, price, platform: "Croma", url, scrapedAt: new Date().toISOString() };
      }
    } catch { continue; }
  }

  return { name: query, price: null, platform: "Croma", url: searchUrl, scrapedAt: new Date().toISOString(), error: "Croma blocked by WAF - browser scraper unavailable" };
}

// --- Vijay Sales search ---

async function searchVijaySales(query: string): Promise<ScrapeResult> {
  const fallbackUrl = `https://www.vijaysales.com/search/-/results?q=${encodeURIComponent(query)}&category=all`;

  // Strategy 1: Vijay Sales search API (returns JSON)
  try {
    const apiUrl = `https://www.vijaysales.com/rest/V1/search/?searchCriteria[filter_groups][0][filters][0][field]=search_term&searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(query)}&searchCriteria[pageSize]=5`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json",
        "Referer": "https://www.vijaysales.com/",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      if (items.length > 0) {
        const item = items[0];
        const price = item.price ?? item.special_price ?? item.final_price ?? null;
        if (price && price > 100) {
          return {
            name: item.name || query,
            price,
            platform: "Vijay Sales",
            url: item.url || fallbackUrl,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    }
  } catch { /* fall through */ }

  // Strategy 2: Try multiple HTML URL patterns (including search-listing which has product cards)
  const urls = [
    `https://www.vijaysales.com/search-listing?q=${encodeURIComponent(query)}`,
    `https://www.vijaysales.com/search/-/results?q=${encodeURIComponent(query)}&category=all`,
    `https://www.vijaysales.com/catalogsearch/result?q=${encodeURIComponent(query)}`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchHtml(url, "vijaysales");
      if (html.length < 1000) continue; // Skip error pages

      // Vijay Sales loads real search results via Unbxd JS (client-side only)
      // The bestSelling section is a STATIC template with dummy data - skip it
      // Only extract from actual product data (JSON in script tags, ld+json, etc.)
      // Remove the static bestSelling section before parsing
      const cleanedHtml = html.replace(/bestSelling__[\s\S]*?(?=<\/section|<footer)/gi, "");

      const priceRaw =
        extractFirst(cleanedHtml, /"sellingPrice"\s*:\s*"?([\d,]+)"?/i) ??
        extractFirst(cleanedHtml, /"offerPrice"\s*:\s*"?([\d,]+)"?/i) ??
        extractFirst(cleanedHtml, /"price"\s*:\s*"?([\d,]+)"?/i) ??
        extractFirst(cleanedHtml, /<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)<\/span>/i);

      const nameRaw =
        extractFirst(cleanedHtml, /"productName"\s*:\s*"([^"]+)"/i) ??
        extractFirst(cleanedHtml, /"name"\s*:\s*"([^"]+)"/i) ??
        query;

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

  // Strategy 3: Browser fallback
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    return await searchWithBrowser(query, "vijaysales");
  } catch {
    return { name: query, price: null, platform: "Vijay Sales", url: fallbackUrl, scrapedAt: new Date().toISOString(), error: "Vijay Sales scraping failed" };
  }
}

// --- AJIO API search ---

async function searchAjioAPI(query: string): Promise<ScrapeResult> {
  const fallbackUrl = `https://www.ajio.com/search/?text=${encodeURIComponent(query)}`;

  // Strategy 1: Browser scraper (most reliable - AJIO uses Akamai WAF)
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    const result = await searchWithBrowser(query, "ajio");
    if (result.price && result.price > 0) return result;
  } catch { /* fall through */ }

  // Strategy 2: Try AJIO JSON API (may be blocked by Akamai)
  try {
    const url = `https://www.ajio.com/api/search?fields=SITE&currentPage=0&pageSize=5&format=json&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json",
        "Referer": "https://www.ajio.com/",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
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

  // Strategy 3: Try HTML page and extract from embedded JSON
  try {
    const html = await fetchHtml(fallbackUrl, "ajio");
    if (html.length > 1000) {
      const priceRaw =
        extractFirst(html, /"sellingPrice"\s*:\s*"?([\d,]+)"?/i) ??
        extractFirst(html, /"offerPrice"\s*:\s*"?([\d,]+)"?/i) ??
        extractFirst(html, /₹\s*([\d,]+)/i);
      const nameRaw =
        extractFirst(html, /"productName"\s*:\s*"([^"]+)"/i) ??
        extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
        query;
      if (priceRaw) {
        const price = cleanPrice(priceRaw);
        if (price && price > 100) {
          return { name: nameRaw.replace(/\s+/g, " ").trim(), price, platform: "AJIO", url: fallbackUrl, scrapedAt: new Date().toISOString() };
        }
      }
    }
  } catch { /* fall through */ }

  return { name: query, price: null, platform: "AJIO", url: fallbackUrl, scrapedAt: new Date().toISOString(), error: "AJIO blocked by WAF - browser scraper unavailable" };
}

// --- Snapdeal product listing API ---

async function searchSnapdealAPI(query: string): Promise<ScrapeResult> {
  const searchUrl = `https://www.snapdeal.com/search?keyword=${encodeURIComponent(query)}`;
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Strategy 1: Snapdeal's AJAX product listing API (returns HTML with product cards)
  try {
    const apiUrl = `https://www.snapdeal.com/acors/json/product/get/search/0/20/10?keyword=${encodeURIComponent(query)}&sort=rlvncy&lang=en`;
    const html = await fetchHtml(apiUrl, "snapdeal");

    // Extract product titles and prices from the listing HTML
    const titleRegex = /class="product-title"[^>]*>([^<]+)/g;
    const priceRegex = /Rs\.\s*([\d,]+)/g;

    const titles: string[] = [];
    const prices: number[] = [];
    let m;

    while ((m = titleRegex.exec(html)) !== null) {
      titles.push(m[1].trim());
    }
    while ((m = priceRegex.exec(html)) !== null) {
      const p = cleanPrice(m[1]);
      if (p && p > 100) prices.push(p);
    }

    // Find the most relevant product
    let bestName = query;
    let bestPrice: number | null = null;
    let bestRelevance = 0;

    for (let i = 0; i < Math.min(titles.length, prices.length, 10); i++) {
      const nameLower = titles[i].toLowerCase();
      const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
      const relevance = queryWords.length > 0 ? matchCount / queryWords.length : 0;
      if (relevance > bestRelevance) {
        bestRelevance = relevance;
        bestPrice = prices[i];
        bestName = titles[i];
      }
    }

    // If no good match, pick first product with reasonable price
    if (!bestPrice && prices.length > 0 && titles.length > 0) {
      bestPrice = prices[0];
      bestName = titles[0];
    }

    if (bestPrice) {
      return {
        name: bestName,
        price: bestPrice,
        platform: "Snapdeal",
        url: searchUrl,
        scrapedAt: new Date().toISOString(),
      };
    }
  } catch { /* fall through */ }

  // Strategy 2: Direct search page HTML
  try {
    const html = await fetchHtml(searchUrl, "snapdeal");
    return parseGenericSearch(html, query, "Snapdeal", searchUrl);
  } catch { /* fall through */ }

  return { name: query, price: null, platform: "Snapdeal", url: searchUrl, scrapedAt: new Date().toISOString(), error: "Snapdeal search failed" };
}

// --- Tata CLiQ search ---

async function searchTataCliq(query: string): Promise<ScrapeResult> {
  const searchUrl = `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(query)}`;

  // Strategy 1: Tata CLiQ marketplace API
  try {
    const apiUrl = `https://www.tatacliq.com/marketplacewebservices/v2/mpl/products/searchProducts?searchCategory=all&text=${encodeURIComponent(query)}&isKeywordRedirect=true&isKeywordRedirectEnabled=true&page=0&pageSize=5&isTextSearch=true&channel=WEB`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json",
        "Origin": "https://www.tatacliq.com",
        "Referer": searchUrl,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status !== "Failure") {
        const products = data.searchresult || [];
        if (products.length > 0) {
          const p = products[0];
          const price = p.winningSellerPrice?.value ?? p.mrpPrice?.value ?? null;
          const name = p.productname || p.brand || query;
          if (price && price > 100) {
            const productUrl = p.webURL ? `https://www.tatacliq.com${p.webURL}` : searchUrl;
            return { name, price, platform: "Tata CLiQ", url: productUrl, scrapedAt: new Date().toISOString() };
          }
        }
      }
    }
  } catch { /* fall through */ }

  // Strategy 2: Browser scraper (Tata CLiQ is a full SPA)
  try {
    const { searchWithBrowser } = await import("./browser-scraper");
    const result = await searchWithBrowser(query, "tatacliq");
    if (result.price && result.price > 0) return result;
  } catch { /* fall through */ }

  // Strategy 3: Parse the HTML shell for any embedded data
  try {
    const html = await fetchHtml(searchUrl, "tatacliq");
    // Check for __NEXT_DATA__ or any embedded JSON
    const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const priceMatch = nextDataMatch[1].match(/"sellingPrice"\s*:\s*"?([\d,]+)"?/);
      const nameMatch = nextDataMatch[1].match(/"productName"\s*:\s*"([^"]+)"/);
      if (priceMatch) {
        const price = cleanPrice(priceMatch[1]);
        if (price && price > 100) {
          return {
            name: nameMatch ? nameMatch[1] : query,
            price,
            platform: "Tata CLiQ",
            url: searchUrl,
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    }
    // Try generic extraction from any embedded JSON
    return parseGenericSearch(html, query, "Tata CLiQ", searchUrl);
  } catch { /* fall through */ }

  return { name: query, price: null, platform: "Tata CLiQ", url: searchUrl, scrapedAt: new Date().toISOString(), error: "Tata CLiQ: SPA requires browser rendering" };
}

// --- Smart platform selection based on product category ---

const ELECTRONICS_KEYWORDS = [
  "ac", "air conditioner", "tv", "television", "laptop", "phone", "mobile", "tablet",
  "iphone", "ipad", "macbook", "samsung galaxy", "oneplus", "pixel", "redmi", "realme", "vivo", "oppo", "nothing phone",
  "refrigerator", "fridge", "washing machine", "microwave", "oven", "mixer", "grinder",
  "speaker", "headphone", "earphone", "earbud", "charger", "power bank", "camera",
  "monitor", "printer", "router", "smartwatch", "watch", "fan", "cooler", "heater",
  "iron", "vacuum", "purifier", "dishwasher", "led", "oled", "qled", "inverter",
  "stabilizer", "ups", "hard disk", "ssd", "ram", "gpu", "processor", "keyboard", "mouse",
  "gaming", "console", "playstation", "xbox", "nintendo", "projector", "drone",
  "trimmer", "shaver", "dryer", "straightener", "toaster", "kettle", "induction",
  "geyser", "water heater", "chimney", "hob", "stove",
  "256gb", "128gb", "512gb", "1tb", "ultra", "pro max",
];
const FASHION_KEYWORDS = [
  "shirt", "tshirt", "t-shirt", "jeans", "pant", "trouser", "dress", "kurta", "saree",
  "lehenga", "jacket", "hoodie", "sweater", "shorts", "skirt", "suit", "blazer",
  "shoes", "sneakers", "sandals", "heels", "boots", "slipper", "flip flop",
  "bag", "handbag", "backpack", "wallet", "belt", "sunglasses", "watch",
  "ethnic", "western", "formal", "casual", "sportswear", "activewear",
  "underwear", "lingerie", "socks", "cap", "hat", "scarf", "stole",
];
const BEAUTY_KEYWORDS = [
  "cream", "serum", "moisturizer", "sunscreen", "lotion", "shampoo", "conditioner",
  "lipstick", "foundation", "mascara", "eyeliner", "perfume", "fragrance", "deodorant",
  "face wash", "cleanser", "toner", "makeup", "nail polish", "hair oil", "body wash",
  "skincare", "haircare", "beauty", "cosmetic", "kajal",
];

const ELECTRONICS_PLATFORMS: PlatformKey[] = ["amazon", "flipkart", "croma", "snapdeal", "tatacliq", "vijaysales"];
const FASHION_PLATFORMS: PlatformKey[] = ["amazon", "flipkart", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa"];
const BEAUTY_PLATFORMS: PlatformKey[] = ["amazon", "flipkart", "myntra", "ajio", "nykaa"];
const ALL_PLATFORMS: PlatformKey[] = ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"];

function detectCategory(query: string): "electronics" | "fashion" | "beauty" | "general" {
  const q = query.toLowerCase();
  const elecScore = ELECTRONICS_KEYWORDS.filter(kw => q.includes(kw)).length;
  const fashScore = FASHION_KEYWORDS.filter(kw => q.includes(kw)).length;
  const beautyScore = BEAUTY_KEYWORDS.filter(kw => q.includes(kw)).length;

  if (elecScore > 0 && elecScore >= fashScore && elecScore >= beautyScore) return "electronics";
  if (fashScore > 0 && fashScore >= elecScore && fashScore >= beautyScore) return "fashion";
  if (beautyScore > 0 && beautyScore >= elecScore && beautyScore >= fashScore) return "beauty";
  return "general";
}

function getRelevantPlatforms(query: string, requestedPlatforms?: string[]): PlatformKey[] {
  // If user explicitly specified platforms, respect that
  if (requestedPlatforms && requestedPlatforms.length > 0 && requestedPlatforms.length < ALL_PLATFORMS.length) {
    return requestedPlatforms.map(p => p.toLowerCase().trim() as PlatformKey).filter(p => p in SEARCH_URLS);
  }

  const category = detectCategory(query);
  switch (category) {
    case "electronics": return ELECTRONICS_PLATFORMS;
    case "fashion": return FASHION_PLATFORMS;
    case "beauty": return BEAUTY_PLATFORMS;
    default: return ALL_PLATFORMS;
  }
}

/**
 * Search for a product across multiple platforms.
 * Uses smart platform selection + API-based search for blocked sites.
 */
export async function searchProduct(
  name: string,
  platforms?: string[]
): Promise<ScrapeResult[]> {
  const validPlatforms = getRelevantPlatforms(name, platforms);

  if (validPlatforms.length === 0) {
    return [{ name, price: null, platform: "none", url: "", scrapedAt: new Date().toISOString(), error: "No valid platforms" }];
  }

  // Wrap each platform search with a 20-second timeout to prevent hanging
  const PLATFORM_TIMEOUT = 20000;
  function withTimeout(promise: Promise<ScrapeResult>, platform: string): Promise<ScrapeResult> {
    return Promise.race([
      promise,
      new Promise<ScrapeResult>((resolve) =>
        setTimeout(() => resolve({
          name, price: null, platform, url: "",
          scrapedAt: new Date().toISOString(),
          error: `Timeout: ${platform} took longer than ${PLATFORM_TIMEOUT / 1000}s`,
        }), PLATFORM_TIMEOUT)
      ),
    ]);
  }

  const tasks = validPlatforms.map((platform): Promise<ScrapeResult> => {
    // Use dedicated search functions for each platform
    if (platform === "flipkart") return withTimeout(searchFlipkartAPI(name), "Flipkart");
    if (platform === "croma") return withTimeout(searchCromaAPI(name), "Croma");
    if (platform === "vijaysales") return withTimeout(searchVijaySales(name), "Vijay Sales");
    if (platform === "ajio") return withTimeout(searchAjioAPI(name), "AJIO");
    if (platform === "snapdeal") return withTimeout(searchSnapdealAPI(name), "Snapdeal");
    if (platform === "tatacliq") return withTimeout(searchTataCliq(name), "Tata CLiQ");

    const searchUrl = SEARCH_URLS[platform](name);
    return withTimeout((async () => {
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
    })(), platform);
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
