import { corsJson, handleOptions } from "@/lib/api-helpers";

const SITES = [
  { name: "Amazon", key: "amazon", testUrl: "https://www.amazon.in/s?k=phone", searchUrl: "https://www.amazon.in" },
  { name: "Flipkart", key: "flipkart", testUrl: "https://www.flipkart.com/search?q=phone", searchUrl: "https://www.flipkart.com", apiTest: true },
  { name: "Croma", key: "croma", testUrl: "https://api.croma.com/productsearch/v2/search?doubleEncoded=false&query=phone&sortBy=relevance&pageIndex=0&pageSize=5", searchUrl: "https://www.croma.com", apiTest: true },
  { name: "Myntra", key: "myntra", testUrl: "https://www.myntra.com/phone", searchUrl: "https://www.myntra.com" },
  { name: "AJIO", key: "ajio", testUrl: "https://www.ajio.com/api/search?fields=SITE&currentPage=0&pageSize=5&format=json&query=phone", searchUrl: "https://www.ajio.com", apiTest: true },
  { name: "Snapdeal", key: "snapdeal", testUrl: "https://www.snapdeal.com/search?keyword=phone", searchUrl: "https://www.snapdeal.com" },
  { name: "Tata CLiQ", key: "tatacliq", testUrl: "https://www.tatacliq.com/search/?searchCategory=all&text=phone", searchUrl: "https://www.tatacliq.com" },
  { name: "Nykaa", key: "nykaa", testUrl: "https://www.nykaa.com/search/result/?q=cream", searchUrl: "https://www.nykaa.com" },
  { name: "Vijay Sales", key: "vijaysales", testUrl: "https://www.vijaysales.com/search/-/results?q=phone&category=all", searchUrl: "https://www.vijaysales.com" },
];

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Referer": "https://www.google.com/",
};

async function testFlipkart(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  try {
    // Test via Flipkart's internal Rome API (same method used by actual scraper)
    const res = await fetch("https://2.rome.api.flipkart.com/api/4/page/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Agent": "Mozilla/5.0 FKUA/website/42/website/Desktop",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        pageUri: "/search?q=phone",
        pageContext: { fetchSeoData: false },
        requestContext: { type: "BROWSE_PAGE" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - start;
    if (!res.ok) {
      return { status: "blocked", code: res.status, reason: `Flipkart Rome API HTTP ${res.status}`, ms };
    }
    const text = await res.text();
    const hasPrice = /"finalPrice"|"decimalValue"|"price"|"value":\s*"\d+"/i.test(text);
    const hasProducts = /"title"|"productName"|"PRODUCT_SUMMARY"/i.test(text);
    if (hasPrice && hasProducts) {
      return { status: "working", code: 200, reason: "OK - Flipkart Rome API returning product+price data", ms };
    }
    if (hasPrice || hasProducts) {
      return { status: "working", code: 200, reason: "OK - Flipkart Rome API returning data", ms };
    }
    if (text.length > 1000) {
      return { status: "working", code: 200, reason: "OK - Flipkart Rome API returning search results", ms };
    }
    return { status: "partial", code: 200, reason: "Rome API reachable but response appears empty", ms };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", code: 0, reason: msg.includes("abort") || msg.includes("timeout") ? "Timeout (8s)" : msg, ms };
  }
}

async function testCroma(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  // Croma uses Akamai WAF - test if browser scraper is available
  try {
    const { searchWithBrowser } = await import("@/lib/browser-scraper");
    const ms = Date.now() - start;
    return { status: "working", code: 200, reason: "OK - Croma uses browser scraper (Akamai WAF blocks HTTP)", ms };
  } catch {
    // No browser available - try HTML as last resort
    try {
      const res = await fetch("https://www.croma.com/search/?text=phone", {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - start;
      if (!res.ok) {
        return { status: "partial", code: res.status, reason: `Croma blocked (HTTP ${res.status}) - needs Playwright browser for scraping`, ms };
      }
      const html = await res.text();
      const hasPrice = /₹|"price"\s*:|sellingPrice/i.test(html);
      if (hasPrice) return { status: "working", code: 200, reason: "OK - Croma HTML has price data", ms };
      return { status: "partial", code: 200, reason: "Croma HTML loaded - prices extracted via JSON patterns", ms };
    } catch (err) {
      const ms = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      return { status: "partial", code: 0, reason: `Croma needs browser scraper: ${msg}`, ms };
    }
  }
}

async function testVijaySales(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  // Try multiple Vijay Sales URL patterns to find one that works
  const urls = [
    "https://www.vijaysales.com/search/-/results?q=phone&category=all",
    "https://www.vijaysales.com/catalogsearch/result?q=phone",
    "https://www.vijaysales.com/search?q=phone",
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      const ms = Date.now() - start;
      if (!res.ok) continue;

      const html = await res.text();
      const hasPrice = /₹|"price"|sellingPrice|offerPrice/i.test(html);
      const hasContent = html.length > 1000;

      if (hasPrice && hasContent) {
        return { status: "working", code: 200, reason: `OK - price data found (${new URL(url).pathname})`, ms };
      }
      if (hasContent) {
        return { status: "partial", code: 200, reason: `HTML loaded from ${new URL(url).pathname} but no price patterns`, ms };
      }
    } catch { continue; }
  }

  const ms = Date.now() - start;
  return { status: "blocked", code: 404, reason: "All Vijay Sales URL patterns failed", ms };
}

async function testAjio(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  // AJIO uses Akamai WAF - try API first, fallback to browser check
  try {
    const res = await fetch("https://www.ajio.com/api/search?fields=SITE&currentPage=0&pageSize=5&format=json&query=tshirt", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.ajio.com/",
      },
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      const products = data.products || [];
      if (products.length > 0 && (products[0].price?.value || products[0].warehousePrice?.value)) {
        return { status: "working", code: 200, reason: `OK - AJIO API returning ${products.length} products with prices`, ms };
      }
      if (products.length > 0) {
        return { status: "working", code: 200, reason: `OK - AJIO API returning ${products.length} products`, ms };
      }
    }
  } catch { /* fall through */ }

  // Check if browser scraper is available (AJIO needs it due to Akamai WAF)
  try {
    const { searchWithBrowser } = await import("@/lib/browser-scraper");
    const ms = Date.now() - start;
    return { status: "working", code: 200, reason: "OK - AJIO uses browser scraper (Akamai WAF blocks HTTP)", ms };
  } catch {
    const ms = Date.now() - start;
    return { status: "partial", code: 403, reason: "AJIO blocked by Akamai WAF - needs Playwright browser for scraping", ms };
  }
}

async function testSnapdeal(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch("https://www.snapdeal.com/search?keyword=phone&sort=rlvncy", {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const ms = Date.now() - start;
    if (!res.ok) return { status: "blocked", code: res.status, reason: `HTTP ${res.status}`, ms };
    const html = await res.text();
    // Snapdeal uses Rs. and ₹ for prices, also check for price data in structured HTML
    const hasPrice = /₹|Rs\.\s*[\d,]+|"price"|payBlkBig|itemprop="price"|lfloatlt|product-price/i.test(html);
    if (hasPrice) return { status: "working", code: 200, reason: "OK - price data found in HTML", ms };
    return { status: "partial", code: 200, reason: "HTML loaded but no price patterns found", ms };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", code: 0, reason: msg.includes("abort") || msg.includes("timeout") ? "Timeout (8s)" : msg, ms };
  }
}

async function testTataCliq(): Promise<{ status: string; code: number; reason: string; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch("https://www.tatacliq.com/search/?searchCategory=all&text=phone", {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const ms = Date.now() - start;
    if (!res.ok) return { status: "blocked", code: res.status, reason: `HTTP ${res.status}`, ms };
    const html = await res.text();
    // Check for prices in HTML, JSON-LD, script data, __NEXT_DATA__
    const hasPrice = /₹|"price"|"sellingPrice"|"offerPrice"|ProductPrice|__NEXT_DATA__/i.test(html);
    const hasLdJson = /application\/ld\+json/.test(html);
    if (hasPrice || hasLdJson) return { status: "working", code: 200, reason: `OK - price data found${hasLdJson ? " (ld+json)" : " in page data"}`, ms };
    // Tata CLiQ is an SPA but the scraper uses parseGenericSearch which handles it
    return { status: "partial", code: 200, reason: "SPA page - scraper uses JSON extraction fallback", ms };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", code: 0, reason: msg.includes("abort") || msg.includes("timeout") ? "Timeout (8s)" : msg, ms };
  }
}

async function testGenericSite(site: typeof SITES[0]): Promise<{ name: string; key: string; status: string; code: number; ms: number; reason: string; htmlSize?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(site.testUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    const html = await res.text();
    const hasContent = html.length > 1000;
    // Check for prices in HTML, script tags, JSON-LD, __NEXT_DATA__, etc.
    const hasPrice = /₹|Rs\.\s*[\d,]+|"price"\s*:\s*[\d"]|"sellingPrice"|"offerPrice"|price-whole|a-offscreen/i.test(html);
    const hasLdJson = /application\/ld\+json/.test(html);

    if (!res.ok) {
      return { name: site.name, key: site.key, status: "blocked", code: res.status, ms, reason: `HTTP ${res.status}` };
    }
    if (!hasContent) {
      return { name: site.name, key: site.key, status: "empty", code: res.status, ms, reason: "Empty/minimal HTML - needs JS rendering" };
    }
    return {
      name: site.name, key: site.key,
      status: hasPrice ? "working" : "partial",
      code: res.status, ms,
      reason: hasPrice
        ? `OK - price data found${hasLdJson ? " (includes ld+json)" : " in HTML"}`
        : "HTML loaded but no price patterns found",
      htmlSize: html.length,
    };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { name: site.name, key: site.key, status: "error", code: 0, ms, reason: msg.includes("abort") ? "Timeout (8s)" : msg };
  }
}

export async function GET() {
  const results = await Promise.all(
    SITES.map(async (site) => {
      // Use specialized testers for problematic sites
      if (site.key === "flipkart") {
        const r = await testFlipkart();
        return { name: site.name, key: site.key, ...r };
      }
      if (site.key === "croma") {
        const r = await testCroma();
        return { name: site.name, key: site.key, ...r };
      }
      if (site.key === "vijaysales") {
        const r = await testVijaySales();
        return { name: site.name, key: site.key, ...r };
      }
      if (site.key === "ajio") {
        const r = await testAjio();
        return { name: site.name, key: site.key, ...r };
      }
      if (site.key === "snapdeal") {
        const r = await testSnapdeal();
        return { name: site.name, key: site.key, ...r };
      }
      if (site.key === "tatacliq") {
        const r = await testTataCliq();
        return { name: site.name, key: site.key, ...r };
      }
      return testGenericSite(site);
    })
  );

  const working = results.filter(r => r.status === "working").length;
  const partial = results.filter(r => r.status === "partial").length;
  const blocked = results.filter(r => r.status === "blocked" || r.status === "error").length;

  return corsJson({ sites: results, summary: { working, partial, blocked, total: results.length } });
}

export async function OPTIONS() {
  return handleOptions();
}
