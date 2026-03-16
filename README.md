# FineDeal - AI-Powered Price Comparison Platform

A full-stack price comparison and deal tracking system for Indian e-commerce, featuring a Chrome extension, admin dashboard, Telegram bot, and AI-powered product analysis.

## Features

### Chrome Extension
- Real-time product detection on 9 e-commerce sites
- One-click price comparison across all platforms
- Price history charts with AI predictions
- Instant price drop alerts via Email & Telegram
- Supported sites: Amazon, Flipkart, Croma, Myntra, AJIO, Snapdeal, Tata CLiQ, Nykaa, Vijay Sales

### Admin Dashboard
- **Overview** - System stats, CSV import, scraper control, site health monitoring, user management
- **Tracked Products** - Add/delete products, refresh prices, category filters, platform badges
- **Price Analytics** - Line charts, time period toggles, category breakdown, CSV export
- **AI Training Center** - Groq & Gemini connectivity, live AI testing, classification & comparison
- **API Settings** - Manage API keys with live connection testing
- **Trending** - Top products with click-to-compare modal
- **Alerts Management** - Create/delete/pause alerts, notification channel selection
- **System Logs** - Auto-refresh, search, export, level filtering

### AI Pipeline
- **Groq (LLaMA 3.3 70B)** - Product classification, comparison, price trend analysis
- **OpenRouter (Gemini 2.0 Flash)** - Deal summaries, NLP queries
- **AI Validation** - Groq validates scraper results for accuracy (filters wrong products)

### Telegram Bot (@finedeal_bot)
- `/search <product>` - Compare prices across 9 sites
- `/start` - Welcome & setup
- `/id` - Get Chat ID for notifications
- `/status` - Bot health check
- Any text message triggers automatic product search
- Auto-sends scrape results to admin

### Email Notifications
- SMTP via Brevo relay
- Price drop alerts with formatted HTML emails
- Configurable per-alert notification channels

### Scraper
- 9 Indian e-commerce sites
- Anti-detection headers with User-Agent rotation
- Flipkart internal API integration
- Playwright headless browser fallback
- Google search fallback for blocked sites
- AI-validated result filtering

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| AI | Groq API, OpenRouter API |
| Scraping | Playwright, Cheerio, native fetch |
| Email | Raw SMTP with STARTTLS (Brevo) |
| Bot | Telegram Bot API |
| Database | JSON file (SQLite-ready with better-sqlite3) |
| Extension | Chrome Manifest V3 |

## Project Structure

```
finedeal/
├── extension/           # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html/js/css
│   ├── content.js       # Product detection
│   └── background.js    # API communication
├── src/
│   ├── app/
│   │   ├── overview/          # Admin dashboard
│   │   ├── tracked-products/  # Product management
│   │   ├── price-analytics/   # Charts & analytics
│   │   ├── ai-training/       # AI model management
│   │   ├── api-settings/      # API key configuration
│   │   ├── trending/          # Trending products
│   │   ├── alerts/            # Alert management
│   │   ├── system-logs/       # System monitoring
│   │   ├── extension/         # Extension web UI (7 screens)
│   │   └── api/               # 15 API endpoints
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── DashboardLayout.tsx
│   │   └── ExtensionHeader.tsx
│   └── lib/
│       ├── scraper.ts         # 9-site scraper
│       ├── browser-scraper.ts # Playwright fallback
│       ├── ai.ts              # Groq + OpenRouter
│       ├── notifications.ts   # Email + Telegram
│       ├── smtp.ts            # SMTP client
│       ├── users.ts           # User tracking
│       ├── db.ts              # Database
│       └── alert-checker.ts   # Alert evaluation
├── data/
│   └── pretrained-products.csv  # 40 products for demo
└── FINEDEAL-GUIDE.md          # Deployment guide
```

## Getting Started

### Prerequisites
- Node.js 18+
- Chrome browser (for extension)

### Installation

```bash
git clone https://github.com/ayushap18/finedeal-V2.0.git
cd finedeal-V2.0
npm install
npx playwright install chromium
```

### Configuration

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

### Run

```bash
npm run dev
```

Open http://localhost:3000

### Load Demo Data

```bash
curl -X POST http://localhost:3000/api/pretrain
```

### Install Chrome Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

## API Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/products` | GET, POST | Product CRUD |
| `/api/products/[id]` | GET, PUT, DELETE | Single product |
| `/api/alerts` | GET, POST | Alert management |
| `/api/alerts/[id]` | PUT, DELETE | Single alert |
| `/api/scraper` | GET, POST | Scraper control |
| `/api/scraper/health` | GET | Site health check |
| `/api/ai` | GET, POST | AI model status & actions |
| `/api/analytics` | GET | Dashboard analytics |
| `/api/settings` | GET, PUT | App settings |
| `/api/notify` | POST | Send notifications |
| `/api/telegram` | GET, POST | Bot webhook |
| `/api/cron/telegram` | GET | Bot auto-poll |
| `/api/users` | GET, POST | User tracking |
| `/api/import` | POST | CSV import |
| `/api/pretrain` | GET, POST | Load demo data |
| `/api/logs` | GET, POST, DELETE | System logs |
| `/api/cron` | GET | Run alert checks |

## Screenshots

### Admin Dashboard
The admin dashboard provides full control over the price comparison system, including product management, scraper control, AI model monitoring, and user tracking.

### Chrome Extension
The extension detects products on supported e-commerce sites and provides instant price comparison, price history, and alert setup.

### Telegram Bot
The @finedeal_bot provides instant price comparison via Telegram messages, supporting product search and price alerts.

## License

MIT

## Author

**Ayush Sharma** - [@ayushap18](https://github.com/ayushap18)
