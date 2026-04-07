import fs from "fs";
import path from "path";
import { getDb } from "./sqlite-db";
import type { DbSchema } from "./seed";

const JSON_PATH = path.join(process.cwd(), "data", "db.json");
const JSON_BAK_PATH = path.join(process.cwd(), "data", "db.json.bak");

export interface MigrationResult {
  migrated: boolean;
  counts: Record<string, number>;
}

export function migrateFromJson(): MigrationResult {
  // If there's no source file, nothing to migrate
  if (!fs.existsSync(JSON_PATH)) {
    return { migrated: false, counts: {} };
  }

  const db = getDb();

  // Check if SQLite already has data — skip if so
  const existingCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM products").get() as { cnt: number }
  ).cnt;

  if (existingCount > 0) {
    return { migrated: false, counts: {} };
  }

  // Read and parse db.json
  let jsonData: DbSchema;
  try {
    const raw = fs.readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw) as DbSchema;
  } catch (err) {
    console.error("[migrate] Failed to parse db.json:", err);
    return { migrated: false, counts: {} };
  }

  const counts: Record<string, number> = {
    products: 0,
    price_history: 0,
    alerts: 0,
    system_logs: 0,
    settings: 0,
  };

  const now = new Date().toISOString();

  // Prepare statements
  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products
      (id, name, platform, category, url, image_url,
       current_price, original_price, lowest_price, highest_price,
       currency, status, last_checked, created_at, updated_at)
    VALUES
      (@id, @name, @platform, @category, @url, @image_url,
       @current_price, @original_price, @lowest_price, @highest_price,
       @currency, @status, @last_checked, @created_at, @updated_at)
  `);

  const insertPriceHistory = db.prepare(`
    INSERT OR IGNORE INTO price_history
      (id, product_id, price, currency, recorded_at)
    VALUES
      (@id, @product_id, @price, @currency, @recorded_at)
  `);

  const insertAlert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, product_id, product_name, platform, alert_type,
       target_value, current_price, status,
       notify_email, notify_telegram,
       triggered_at, created_at, updated_at)
    VALUES
      (@id, @product_id, @product_name, @platform, @alert_type,
       @target_value, @current_price, @status,
       @notify_email, @notify_telegram,
       @triggered_at, @created_at, @updated_at)
  `);

  const insertLog = db.prepare(`
    INSERT OR IGNORE INTO system_logs
      (id, level, message, source, details, created_at)
    VALUES
      (@id, @level, @message, @source, @details, @created_at)
  `);

  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  // Temporarily disable FK checks — legacy JSON data may have orphaned references
  db.pragma("foreign_keys = OFF");

  // Run everything inside a single transaction
  const runMigration = db.transaction(() => {
    // Products
    for (const p of jsonData.products ?? []) {
      insertProduct.run({
        id: p.id,
        name: p.name,
        platform: p.platform,
        category: p.category,
        url: p.url,
        image_url: p.image_url ?? "",
        current_price: p.current_price ?? 0,
        original_price: p.original_price ?? 0,
        lowest_price: p.lowest_price ?? 0,
        highest_price: p.highest_price ?? 0,
        currency: p.currency ?? "INR",
        status: p.status ?? "tracking",
        last_checked: p.last_checked ?? "",
        created_at: p.created_at ?? now,
        updated_at: now,
      });
      counts.products++;
    }

    // Price history
    for (const ph of jsonData.price_history ?? []) {
      insertPriceHistory.run({
        id: ph.id,
        product_id: ph.product_id,
        price: ph.price ?? 0,
        currency: ph.currency ?? "INR",
        recorded_at: ph.recorded_at ?? now,
      });
      counts.price_history++;
    }

    // Alerts — convert boolean notify_* fields to 0/1 integers
    for (const a of jsonData.alerts ?? []) {
      insertAlert.run({
        id: a.id,
        product_id: a.product_id,
        product_name: a.product_name ?? "",
        platform: a.platform ?? "",
        alert_type: a.alert_type,
        target_value: a.target_value ?? 0,
        current_price: a.current_price ?? 0,
        status: a.status ?? "active",
        notify_email: a.notify_email ? 1 : 0,
        notify_telegram: a.notify_telegram ? 1 : 0,
        triggered_at: a.triggered_at ?? null,
        created_at: a.created_at ?? now,
        updated_at: now,
      });
      counts.alerts++;
    }

    // System logs
    for (const log of jsonData.system_logs ?? []) {
      insertLog.run({
        id: log.id,
        level: log.level,
        message: log.message ?? "",
        source: log.source ?? "",
        details: log.details ?? "",
        created_at: log.created_at ?? now,
      });
      counts.system_logs++;
    }

    // Settings — flatten the settings object into key/value pairs
    const settings = jsonData.settings;
    if (settings && typeof settings === "object") {
      for (const [key, value] of Object.entries(settings)) {
        upsertSetting.run({ key, value: String(value ?? "") });
        counts.settings++;
      }
    }
  });

  runMigration();

  // Re-enable FK checks
  db.pragma("foreign_keys = ON");

  // Rename db.json → db.json.bak so migration won't re-run next time
  try {
    fs.renameSync(JSON_PATH, JSON_BAK_PATH);
  } catch (err) {
    console.warn("[migrate] Could not rename db.json to db.json.bak:", err);
  }

  return { migrated: true, counts };
}
