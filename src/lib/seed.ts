export interface Product {
  id: string;
  name: string;
  platform: string;
  category: string;
  url: string;
  image_url: string;
  current_price: number;
  original_price: number;
  lowest_price: number;
  highest_price: number;
  currency: string;
  status: "tracking" | "paused" | "error";
  last_checked: string;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  price: number;
  currency: string;
  recorded_at: string;
}

export interface Alert {
  id: string;
  product_id: string;
  product_name: string;
  platform: string;
  alert_type: "price_drop" | "target_price" | "back_in_stock" | "percentage_drop";
  target_value: number;
  current_price: number;
  status: "active" | "paused" | "triggered";
  notify_email: boolean;
  notify_telegram: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface SystemLog {
  id: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
  source: string;
  details: string;
  created_at: string;
}

export interface Settings {
  groq_key: string;
  gemini_key: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  user_email: string;
  scrape_interval_minutes: number;
  ai_model: string;
  notifications_enabled: boolean;
}

export interface DbSchema {
  products: Product[];
  price_history: PriceHistory[];
  alerts: Alert[];
  system_logs: SystemLog[];
  settings: Settings;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

const productIds = [
  "p001", "p002", "p003", "p004", "p005",
  "p006", "p007", "p008", "p009", "p010", "p011", "p012",
];

export function getSeedData(): DbSchema {
  const products: Product[] = [
    {
      id: "p001", name: "Samsung Galaxy S24 Ultra", platform: "amazon", category: "smartphones",
      url: "https://amazon.in/dp/B0CS5XXXXX", image_url: "/images/s24ultra.jpg",
      current_price: 129999, original_price: 144999, lowest_price: 119999, highest_price: 144999,
      currency: "INR", status: "tracking", last_checked: hoursAgo(1), created_at: daysAgo(25),
    },
    {
      id: "p002", name: "iPhone 16 Pro Max", platform: "flipkart", category: "smartphones",
      url: "https://flipkart.com/iphone-16-pro-max", image_url: "/images/iphone16.jpg",
      current_price: 144900, original_price: 159900, lowest_price: 139900, highest_price: 159900,
      currency: "INR", status: "tracking", last_checked: hoursAgo(2), created_at: daysAgo(20),
    },
    {
      id: "p003", name: "MacBook Air M3", platform: "amazon", category: "laptops",
      url: "https://amazon.in/dp/B0CXXXXMBA", image_url: "/images/macbookairm3.jpg",
      current_price: 99990, original_price: 114900, lowest_price: 94990, highest_price: 114900,
      currency: "INR", status: "tracking", last_checked: hoursAgo(1), created_at: daysAgo(30),
    },
    {
      id: "p004", name: "Sony WH-1000XM5", platform: "croma", category: "headphones",
      url: "https://croma.com/sony-wh1000xm5", image_url: "/images/sonyxm5.jpg",
      current_price: 24990, original_price: 29990, lowest_price: 22990, highest_price: 29990,
      currency: "INR", status: "tracking", last_checked: hoursAgo(3), created_at: daysAgo(18),
    },
    {
      id: "p005", name: "Nike Air Max 270", platform: "myntra", category: "shoes",
      url: "https://myntra.com/nike-air-max-270", image_url: "/images/nikeairmax.jpg",
      current_price: 11497, original_price: 14995, lowest_price: 9999, highest_price: 14995,
      currency: "INR", status: "tracking", last_checked: hoursAgo(4), created_at: daysAgo(15),
    },
    {
      id: "p006", name: "iPad Air M2", platform: "amazon", category: "tablets",
      url: "https://amazon.in/dp/B0CXXXXIPA", image_url: "/images/ipadairm2.jpg",
      current_price: 59900, original_price: 69900, lowest_price: 54900, highest_price: 69900,
      currency: "INR", status: "tracking", last_checked: hoursAgo(1), created_at: daysAgo(22),
    },
    {
      id: "p007", name: "Dell XPS 15", platform: "flipkart", category: "laptops",
      url: "https://flipkart.com/dell-xps-15", image_url: "/images/dellxps15.jpg",
      current_price: 139990, original_price: 159990, lowest_price: 134990, highest_price: 159990,
      currency: "INR", status: "paused", last_checked: daysAgo(2), created_at: daysAgo(28),
    },
    {
      id: "p008", name: "Samsung 65\" OLED 4K TV", platform: "croma", category: "tvs",
      url: "https://croma.com/samsung-65-oled", image_url: "/images/samsungtv.jpg",
      current_price: 174990, original_price: 219990, lowest_price: 169990, highest_price: 219990,
      currency: "INR", status: "tracking", last_checked: hoursAgo(5), created_at: daysAgo(12),
    },
    {
      id: "p009", name: "AirPods Pro 2", platform: "amazon", category: "headphones",
      url: "https://amazon.in/dp/B0CXXXXAPP", image_url: "/images/airpodspro2.jpg",
      current_price: 20990, original_price: 24900, lowest_price: 18990, highest_price: 24900,
      currency: "INR", status: "tracking", last_checked: hoursAgo(2), created_at: daysAgo(10),
    },
    {
      id: "p010", name: "PS5 Slim Digital Edition", platform: "flipkart", category: "gaming",
      url: "https://flipkart.com/ps5-slim-digital", image_url: "/images/ps5slim.jpg",
      current_price: 39990, original_price: 44990, lowest_price: 37990, highest_price: 44990,
      currency: "INR", status: "tracking", last_checked: hoursAgo(6), created_at: daysAgo(8),
    },
    {
      id: "p011", name: "Dyson V15 Detect", platform: "amazon", category: "appliances",
      url: "https://amazon.in/dp/B0CXXXXDYS", image_url: "/images/dysonv15.jpg",
      current_price: 52990, original_price: 62900, lowest_price: 49990, highest_price: 62900,
      currency: "INR", status: "error", last_checked: daysAgo(1), created_at: daysAgo(14),
    },
    {
      id: "p012", name: "Adidas Ultraboost 24", platform: "myntra", category: "shoes",
      url: "https://myntra.com/adidas-ultraboost-24", image_url: "/images/ultraboost.jpg",
      current_price: 14999, original_price: 19999, lowest_price: 12999, highest_price: 19999,
      currency: "INR", status: "tracking", last_checked: hoursAgo(3), created_at: daysAgo(6),
    },
  ];

  // Generate price history: ~3 entries per product over the last 30 days
  const price_history: PriceHistory[] = [];
  let phIdx = 1;
  for (const p of products) {
    const spread = p.highest_price - p.lowest_price;
    const points = [28, 18, 10, 3, 0];
    for (const day of points) {
      const variance = Math.round((Math.random() * 0.6 + 0.2) * spread);
      const price = day === 0 ? p.current_price : p.lowest_price + variance;
      price_history.push({
        id: `ph${String(phIdx++).padStart(3, "0")}`,
        product_id: p.id,
        price,
        currency: "INR",
        recorded_at: daysAgo(day),
      });
    }
  }

  const alerts: Alert[] = [
    {
      id: "a001", product_id: "p001", product_name: "Samsung Galaxy S24 Ultra", platform: "amazon",
      alert_type: "price_drop", target_value: 119999, current_price: 129999,
      status: "active", notify_email: true, notify_telegram: true, triggered_at: null, created_at: daysAgo(20),
    },
    {
      id: "a002", product_id: "p002", product_name: "iPhone 16 Pro Max", platform: "flipkart",
      alert_type: "target_price", target_value: 134900, current_price: 144900,
      status: "active", notify_email: true, notify_telegram: false, triggered_at: null, created_at: daysAgo(18),
    },
    {
      id: "a003", product_id: "p003", product_name: "MacBook Air M3", platform: "amazon",
      alert_type: "percentage_drop", target_value: 15, current_price: 99990,
      status: "triggered", notify_email: true, notify_telegram: true, triggered_at: hoursAgo(6), created_at: daysAgo(25),
    },
    {
      id: "a004", product_id: "p005", product_name: "Nike Air Max 270", platform: "myntra",
      alert_type: "price_drop", target_value: 9999, current_price: 11497,
      status: "active", notify_email: false, notify_telegram: true, triggered_at: null, created_at: daysAgo(10),
    },
    {
      id: "a005", product_id: "p008", product_name: "Samsung 65\" OLED 4K TV", platform: "croma",
      alert_type: "target_price", target_value: 159990, current_price: 174990,
      status: "paused", notify_email: true, notify_telegram: false, triggered_at: null, created_at: daysAgo(8),
    },
    {
      id: "a006", product_id: "p009", product_name: "AirPods Pro 2", platform: "amazon",
      alert_type: "price_drop", target_value: 17990, current_price: 20990,
      status: "active", notify_email: true, notify_telegram: true, triggered_at: null, created_at: daysAgo(7),
    },
    {
      id: "a007", product_id: "p010", product_name: "PS5 Slim Digital Edition", platform: "flipkart",
      alert_type: "percentage_drop", target_value: 20, current_price: 39990,
      status: "triggered", notify_email: true, notify_telegram: false, triggered_at: hoursAgo(12), created_at: daysAgo(5),
    },
    {
      id: "a008", product_id: "p012", product_name: "Adidas Ultraboost 24", platform: "myntra",
      alert_type: "back_in_stock", target_value: 0, current_price: 14999,
      status: "active", notify_email: false, notify_telegram: true, triggered_at: null, created_at: daysAgo(3),
    },
  ];

  const system_logs: SystemLog[] = [
    { id: "l001", level: "success", message: "Price scrape completed for Amazon — 4 products updated", source: "scraper", details: "Duration: 12.3s", created_at: hoursAgo(1) },
    { id: "l002", level: "success", message: "Price scrape completed for Flipkart — 3 products updated", source: "scraper", details: "Duration: 8.7s", created_at: hoursAgo(1) },
    { id: "l003", level: "info", message: "AI prediction model retrained with 240 data points", source: "ai-engine", details: "Accuracy: 94.2%", created_at: hoursAgo(3) },
    { id: "l004", level: "warning", message: "Croma scraper rate limited — retrying in 60s", source: "scraper", details: "HTTP 429 received", created_at: hoursAgo(4) },
    { id: "l005", level: "error", message: "Failed to scrape Dyson V15 Detect — page structure changed", source: "scraper", details: "Selector .price-box not found", created_at: hoursAgo(5) },
    { id: "l006", level: "success", message: "Email alert sent for MacBook Air M3 price drop", source: "notifications", details: "Sent to user@example.com", created_at: hoursAgo(6) },
    { id: "l007", level: "success", message: "Telegram alert sent for PS5 Slim Digital Edition", source: "notifications", details: "Chat ID: 123456789", created_at: hoursAgo(7) },
    { id: "l008", level: "info", message: "Scheduled scrape job started — 12 products queued", source: "scheduler", details: "Cron: */30 * * * *", created_at: hoursAgo(8) },
    { id: "l009", level: "warning", message: "Gemini API key nearing rate limit — 450/500 requests used", source: "ai-engine", details: "Reset in 2h 15m", created_at: hoursAgo(10) },
    { id: "l010", level: "error", message: "SMTP connection failed — email notifications paused", source: "notifications", details: "ECONNREFUSED smtp.gmail.com:587", created_at: hoursAgo(12) },
    { id: "l011", level: "info", message: "New product added: Adidas Ultraboost 24", source: "products", details: "Platform: Myntra", created_at: daysAgo(6) },
    { id: "l012", level: "success", message: "Price drop detected: Sony WH-1000XM5 ₹29,990 → ₹24,990", source: "price-tracker", details: "Drop: 16.7%", created_at: daysAgo(2) },
    { id: "l013", level: "info", message: "Database backup completed — 1.2 MB", source: "system", details: "Backup stored at /backups/db-20240115.json", created_at: daysAgo(1) },
    { id: "l014", level: "warning", message: "Myntra scraper detected CAPTCHA — manual intervention may be needed", source: "scraper", details: "Product: Nike Air Max 270", created_at: daysAgo(3) },
    { id: "l015", level: "success", message: "Bulk price update: 10 products refreshed successfully", source: "scraper", details: "Duration: 45.2s, Errors: 0", created_at: daysAgo(1) },
    { id: "l016", level: "info", message: "Chrome extension connected — version 2.1.0", source: "extension", details: "Browser: Chrome 121", created_at: hoursAgo(2) },
  ];

  const settings: Settings = {
    groq_key: "gsk_placeholder_xxxxxxxxxxxxxxxxxxxx",
    gemini_key: "AIzaSy_placeholder_xxxxxxxxxxxxxxx",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_user: "alerts@finedeal.app",
    smtp_pass: "app_password_placeholder",
    telegram_bot_token: "7123456789:AAH_placeholder_xxxxxxxxxxxxxxxxx",
    telegram_chat_id: "123456789",
    user_email: "",
    scrape_interval_minutes: 30,
    ai_model: "gemini-1.5-flash",
    notifications_enabled: true,
  };

  return { products, price_history, alerts, system_logs, settings };
}
