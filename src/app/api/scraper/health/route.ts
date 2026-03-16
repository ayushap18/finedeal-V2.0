import { corsJson, handleOptions } from "@/lib/api-helpers";

const SITES = [
  { name: "Amazon", key: "amazon", testUrl: "https://www.amazon.in/s?k=phone", searchUrl: "https://www.amazon.in" },
  { name: "Flipkart", key: "flipkart", testUrl: "https://www.flipkart.com/search?q=phone", searchUrl: "https://www.flipkart.com" },
  { name: "Croma", key: "croma", testUrl: "https://www.croma.com/searchB?q=phone", searchUrl: "https://www.croma.com" },
  { name: "Myntra", key: "myntra", testUrl: "https://www.myntra.com/phone", searchUrl: "https://www.myntra.com" },
  { name: "AJIO", key: "ajio", testUrl: "https://www.ajio.com/search/?text=phone", searchUrl: "https://www.ajio.com" },
  { name: "Snapdeal", key: "snapdeal", testUrl: "https://www.snapdeal.com/search?keyword=phone", searchUrl: "https://www.snapdeal.com" },
  { name: "Tata CLiQ", key: "tatacliq", testUrl: "https://www.tatacliq.com/search/?searchCategory=all&text=phone", searchUrl: "https://www.tatacliq.com" },
  { name: "Nykaa", key: "nykaa", testUrl: "https://www.nykaa.com/search/result/?q=cream", searchUrl: "https://www.nykaa.com" },
  { name: "Vijay Sales", key: "vijaysales", testUrl: "https://www.vijaysales.com/search/phone", searchUrl: "https://www.vijaysales.com" },
];

export async function GET() {
  const results = await Promise.all(
    SITES.map(async (site) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(site.testUrl, {
          headers: {
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
          },
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        const ms = Date.now() - start;
        const html = await res.text();
        const hasContent = html.length > 1000;
        const hasPrice = /₹|price|amount/i.test(html);

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
          reason: hasPrice ? "OK - price data found in HTML" : "HTML loaded but no price patterns found",
          htmlSize: html.length,
        };
      } catch (err) {
        const ms = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        return { name: site.name, key: site.key, status: "error", code: 0, ms, reason: msg.includes("abort") ? "Timeout (8s)" : msg };
      }
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
