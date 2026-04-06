import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  params?: Record<string, string>;
  body?: Record<string, string>;
  response?: string;
}

const API_DOCS: EndpointDoc[] = [
  // Products
  { method: "GET", path: "/api/products", description: "List all tracked products with optional filtering and pagination", auth: false, params: { search: "Filter by name (string)", category: "Filter by category (string)", platform: "Filter by platform (string)", page: "Page number (default: 1)", limit: "Items per page (default: 20, max: 100)" }, response: "{ products, total, page, limit, totalPages }" },
  { method: "POST", path: "/api/products", description: "Add a new product to track", auth: false, body: { name: "Product name (required)", platform: "Platform name (required, enum)", url: "Product URL", current_price: "Current price (number)", original_price: "Original price (number)" }, response: "{ product }" },
  { method: "GET", path: "/api/products/:id", description: "Get a single product by ID", auth: false, response: "{ product, price_history }" },
  { method: "PUT", path: "/api/products/:id", description: "Update a product", auth: false, body: { name: "Product name", status: "tracking | paused | error" }, response: "{ product }" },
  { method: "DELETE", path: "/api/products/:id", description: "Delete a product and its history", auth: false, response: "{ success: true }" },

  // Alerts
  { method: "GET", path: "/api/alerts", description: "List all alerts with pagination", auth: false, params: { page: "Page number", limit: "Items per page" }, response: "{ alerts, total, page, limit, totalPages, stats }" },
  { method: "POST", path: "/api/alerts", description: "Create a new price alert", auth: false, body: { product_id: "Product ID (required)", alert_type: "price_drop | target_price | percentage_drop | back_in_stock (required)", target_value: "Target value (number)", notify_email: "Send email (boolean)", notify_telegram: "Send Telegram (boolean)" }, response: "{ alert }" },
  { method: "PUT", path: "/api/alerts/:id", description: "Update an alert", auth: false, response: "{ alert }" },
  { method: "DELETE", path: "/api/alerts/:id", description: "Delete an alert", auth: false, response: "{ success: true }" },

  // Scraper
  { method: "GET", path: "/api/scraper", description: "Get scraper status", auth: false, response: "{ status, last_run }" },
  { method: "POST", path: "/api/scraper", description: "Trigger a price scrape", auth: false, body: { query: "Search query or product URL" }, response: "{ results }" },
  { method: "GET", path: "/api/scraper/health", description: "Check health of all scraper targets", auth: false, response: "{ sites: [...] }" },

  // AI
  { method: "GET", path: "/api/ai", description: "Get AI model status", auth: false, response: "{ groq, gemini }" },
  { method: "POST", path: "/api/ai", description: "Run AI analysis on products", auth: false, response: "{ result }" },

  // Analytics
  { method: "GET", path: "/api/analytics", description: "Get dashboard analytics and statistics", auth: false, response: "{ total_products, total_alerts, ... }" },

  // Settings (Protected)
  { method: "GET", path: "/api/settings", description: "Get application settings", auth: true, response: "{ settings }" },
  { method: "PUT", path: "/api/settings", description: "Update application settings", auth: true, body: { notifications_enabled: "boolean", user_email: "string", scrape_interval_minutes: "number" }, response: "{ settings }" },

  // Auth (Protected)
  { method: "GET", path: "/api/auth", description: "List API keys", auth: true, response: "{ keys: [...] }" },
  { method: "POST", path: "/api/auth", description: "Create a new API key", auth: true, body: { name: "Key name (required)", role: "admin (default)" }, response: "{ id, key }" },
  { method: "DELETE", path: "/api/auth", description: "Delete an API key", auth: true, body: { id: "Key ID (required)" }, response: "{ success: true }" },

  // Logs (Protected)
  { method: "GET", path: "/api/logs", description: "Get system logs with pagination", auth: true, params: { level: "Filter by level", page: "Page number", limit: "Items per page" }, response: "{ logs, total, page, limit, totalPages }" },
  { method: "DELETE", path: "/api/logs", description: "Clear all system logs", auth: true, response: "{ success: true }" },

  // Notifications
  { method: "POST", path: "/api/notify", description: "Send a test notification", auth: false, body: { type: "email | telegram", to: "Recipient", message: "Message body" }, response: "{ result }" },

  // Health
  { method: "GET", path: "/api/health", description: "Health check for monitoring and load balancers", auth: false, response: "{ status, checks, memory_mb, uptime_seconds }" },

  // Cron
  { method: "GET", path: "/api/cron", description: "Trigger alert checking", auth: false, response: "{ checked, triggered, errors }" },
  { method: "GET", path: "/api/cron/scrape", description: "Trigger scheduled price scrape", auth: false, response: "{ results }" },
  { method: "GET", path: "/api/cron/digest", description: "Trigger daily digest email", auth: false, response: "{ sent }" },

  // Users
  { method: "GET", path: "/api/users", description: "List extension users", auth: false, response: "{ users }" },
  { method: "POST", path: "/api/users", description: "Register or update extension user", auth: false, response: "{ user }" },

  // Import
  { method: "POST", path: "/api/import", description: "Import products from CSV", auth: true, body: { csv: "CSV content (string)" }, response: "{ imported, errors }" },

  // Docs
  { method: "GET", path: "/api/docs", description: "This endpoint — API documentation", auth: false, response: "{ endpoints: [...] }" },
];

export async function GET() {
  return NextResponse.json({
    name: "FineDeal API",
    version: process.env.npm_package_version || "4.0.0",
    description: "AI-powered price comparison and deal tracking API",
    base_url: process.env.BASE_URL || "http://localhost:3000",
    auth_note: "Protected endpoints require Authorization: Bearer <api_key> header",
    endpoints: API_DOCS,
    total_endpoints: API_DOCS.length,
  }, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
