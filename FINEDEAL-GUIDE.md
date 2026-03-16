# FineDeal - Final Year Project Guide

## Current System Status

### Working Services
| Service | Status | Details |
|---------|--------|---------|
| Groq AI | Connected | LLaMA 3.3 70B - product classification, comparison, price analysis |
| Gemini AI | Connected | gemini-2.5-flash via Vertex AI key - classification, deal summaries |
| Email (SMTP) | Working | Brevo relay - real email delivery |
| Telegram Bot | Connected | @finedeal_bot - commands: /start, /id, /status, /help |
| Chrome Extension | Ready | Manifest V3, content scripts for 9 sites |

### Scraper Site Status
| Site | Method | Status | Notes |
|------|--------|--------|-------|
| Amazon.in | HTML + Headers | Working | Anti-bot bypassed with Referer + browser headers |
| Flipkart | Internal API | Partial | API connects, price extraction needs tuning |
| Croma | API + HTML fallback | Partial | API sometimes returns data, HTML fallback available |
| Myntra | HTML scraping | Working | Direct scraping works |
| AJIO | JSON API | Working | Uses AJIO's search API |
| Snapdeal | HTML scraping | Working | Direct scraping works |
| Tata CLiQ | HTML scraping | Working | Direct scraping works |
| Nykaa | HTML scraping | Working | Direct scraping works |
| Vijay Sales | Multi-URL fallback | Working | Tries 3 URL patterns |

---

## Recommended Improvements for Production

### 1. Use a Headless Browser (HIGHEST IMPACT)

**Why:** Flipkart, AJIO (sometimes), and Croma use heavy JavaScript rendering. A headless browser can load the full page like a real browser.

**Best option: Playwright**
```bash
npm install playwright
npx playwright install chromium
```

**Why Playwright over Puppeteer:**
- Faster than Puppeteer
- Better anti-detection (less fingerprinting)
- Supports multiple browsers (Chromium, Firefox, WebKit)
- Better for server-side use in Next.js

**Alternative: Puppeteer**
```bash
npm install puppeteer
```

**Implementation approach:**
```typescript
import { chromium } from 'playwright';

async function scrapeWithBrowser(url: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const price = await page.$eval('.price-selector', el => el.textContent);
  await browser.close();
  return price;
}
```

### 2. Use a Proxy Service

**Why:** Even with good headers, sites can block based on IP. A proxy rotates IPs.

**Recommended services:**
- **Bright Data** (best for e-commerce) - smartproxy.com
- **ScraperAPI** - scraperapi.com (easiest, handles headers/proxies automatically)
- **Oxylabs** - for enterprise scale

**ScraperAPI implementation:**
```typescript
const SCRAPER_API_KEY = "your_key";
const url = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&country_code=in`;
const html = await fetch(url).then(r => r.text());
```

### 3. Database Upgrade

**Current:** Flat JSON file (`data/db.json`) - single-threaded, no concurrency, no scaling.

**Recommended: SQLite with better-sqlite3**
```bash
npm install better-sqlite3
```
- Zero-config, file-based (no server needed)
- WAL mode supports concurrent reads
- 100x faster than JSON file for queries
- Production-ready for single-server deployments

**For scaling: PostgreSQL with Prisma**
```bash
npm install prisma @prisma/client
npx prisma init
```

### 4. Real Cron Job Scheduling

**Current:** Manual trigger via `/api/cron`

**Option A: Vercel Cron (if deploying to Vercel)**
Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron", "schedule": "0 */6 * * *" }
  ]
}
```

**Option B: node-cron (for self-hosted)**
```bash
npm install node-cron
```

### 5. Authentication

**Current:** No auth - all APIs are public.

**Recommended: NextAuth.js**
```bash
npm install next-auth
```
- Google/GitHub OAuth for admin login
- API route protection via middleware
- Session management

### 6. Rate Limiting

```bash
npm install express-rate-limit  # or upstash/ratelimit for serverless
```

---

## Telegram Bot Setup

### For Users:
1. Open Telegram
2. Search for **@finedeal_bot**
3. Send `/start`
4. Copy your **Chat ID** from the bot's response
5. Open FineDeal extension → Settings → paste Chat ID
6. Enable "Telegram notifications"

### For Admin:
- Bot token: configured in `.env.local`
- Webhook endpoint: `/api/telegram`
- To set up webhook (for production): `GET /api/telegram?action=setup&url=yourdomain.com`
- Bot commands: /start, /id, /status, /help

---

## Email Setup

**Current:** Brevo SMTP relay (working)

**Configuration in `.env.local`:**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_login
SMTP_PASS=your_brevo_smtp_key
```

**Test:** Dashboard → Quick Actions → Test Notify

---

## Chrome Extension

### Loading in Browser:
1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder
5. Visit any supported e-commerce site
6. Click the FineDeal extension icon

### Supported sites:
Amazon.in, Flipkart, Croma, Myntra, AJIO, Snapdeal, Tata CLiQ, Nykaa, Vijay Sales

---

## CSV Import Format

Upload via Dashboard → Import CSV button.

**Required columns:**
```
name,platform,category,price,url
Samsung Galaxy S24 Ultra,Amazon,Electronics,129999,https://amazon.in/dp/...
iPhone 16 Pro Max,Flipkart,Electronics,144900,https://flipkart.com/...
```

**Supported column aliases:**
- `price` or `current_price`
- `url` or `link`
- `platform` or `site`
- `mrp` or `original_price`

---

## API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/products` | GET/POST | List/create products |
| `/api/products/[id]` | GET/PUT/DELETE | Single product CRUD |
| `/api/alerts` | GET/POST | List/create alerts |
| `/api/alerts/[id]` | PUT/DELETE | Update/delete alert |
| `/api/scraper` | GET/POST | Scraper status / trigger scrape |
| `/api/scraper/health` | GET | Test all 9 sites |
| `/api/ai` | GET/POST | AI status / classify/compare/analyze/summarize |
| `/api/analytics` | GET | Dashboard stats |
| `/api/settings` | GET/PUT | App settings |
| `/api/notify` | POST | Send email/telegram/test |
| `/api/telegram` | GET/POST | Bot info/webhook handler |
| `/api/import` | POST | CSV data import |
| `/api/logs` | GET/POST/DELETE | System logs |
| `/api/cron` | GET | Trigger alert checking |

---

## Architecture

```
finedeal/
├── extension/          # Chrome extension (Manifest V3)
│   ├── manifest.json   # Extension config
│   ├── popup.html/js   # Extension UI
│   ├── content.js      # Product detection on sites
│   └── background.js   # Service worker
├── src/
│   ├── app/
│   │   ├── overview/       # Admin dashboard
│   │   ├── tracked-products/
│   │   ├── price-analytics/
│   │   ├── ai-training/
│   │   ├── api-settings/
│   │   ├── trending/
│   │   ├── alerts/
│   │   ├── system-logs/
│   │   ├── extension/      # Extension web pages
│   │   └── api/            # 12 API routes
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── DashboardLayout.tsx
│   │   └── ExtensionHeader.tsx
│   └── lib/
│       ├── scraper.ts      # 9-site scraper with API fallbacks
│       ├── ai.ts           # Groq + Gemini integration
│       ├── notifications.ts # Email + Telegram
│       ├── smtp.ts         # Raw SMTP client
│       ├── db.ts           # JSON file database
│       └── alert-checker.ts # Alert evaluation
└── data/
    └── db.json             # Database file
```

---

## User Tracking System

Extension users are tracked automatically when they:
- Use the Chrome extension (registers via `/api/users`)
- Message @finedeal_bot on Telegram (auto-registered)
- Set up alerts with email/telegram

**Admin can see:**
- Total users, active users, users with email, users with Telegram
- Per-user: browser, extension version, last active, notification channels
- All accessible from Dashboard → Users button

## Telegram Bot Commands

| Command | Response |
|---------|----------|
| `/start` | Welcome + Chat ID + setup instructions |
| `/id` | Shows Chat ID for copy-paste |
| `/status` | Bot connection status |
| `/help` | All commands list |

**Admin: Poll bot from Dashboard** → "Poll Telegram Bot" button processes pending messages and auto-registers users.

---

## Quick Deployment Checklist

- [ ] Set up Playwright for Flipkart/Croma headless scraping
- [ ] Add authentication (NextAuth.js)
- [ ] Migrate from JSON to SQLite (better-sqlite3 already installed)
- [ ] Set up Vercel Cron or node-cron for scheduled scraping (node-cron installed)
- [ ] Configure Telegram webhook for production domain
- [ ] Add rate limiting to public APIs
- [ ] Set up proper CORS (restrict to your domain)
- [ ] Add input validation/sanitization to all endpoints
- [ ] Set up error monitoring (Sentry)
- [ ] Enable HTTPS and configure CSP headers
- [ ] Deploy to Vercel/Railway for public access
