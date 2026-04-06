import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "finedeal.db");

let dbInstance: Database.Database | null = null;

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      platform       TEXT NOT NULL,
      category       TEXT NOT NULL,
      url            TEXT NOT NULL,
      image_url      TEXT NOT NULL DEFAULT '',
      current_price  REAL NOT NULL DEFAULT 0,
      original_price REAL NOT NULL DEFAULT 0,
      lowest_price   REAL NOT NULL DEFAULT 0,
      highest_price  REAL NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'INR',
      status         TEXT NOT NULL DEFAULT 'tracking',
      last_checked   TEXT NOT NULL DEFAULT '',
      created_at     TEXT NOT NULL DEFAULT '',
      updated_at     TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          TEXT PRIMARY KEY,
      product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price       REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'INR',
      recorded_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id               TEXT PRIMARY KEY,
      product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_name     TEXT NOT NULL DEFAULT '',
      platform         TEXT NOT NULL DEFAULT '',
      alert_type       TEXT NOT NULL,
      target_value     REAL NOT NULL DEFAULT 0,
      current_price    REAL NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'active',
      notify_email     INTEGER NOT NULL DEFAULT 0,
      notify_telegram  INTEGER NOT NULL DEFAULT 0,
      user_email       TEXT NOT NULL DEFAULT '',
      telegram_chat_id TEXT NOT NULL DEFAULT '',
      triggered_at     TEXT,
      created_at       TEXT NOT NULL DEFAULT '',
      updated_at       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id         TEXT PRIMARY KEY,
      level      TEXT NOT NULL,
      message    TEXT NOT NULL DEFAULT '',
      source     TEXT NOT NULL DEFAULT '',
      details    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         TEXT PRIMARY KEY,
      key_hash   TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL DEFAULT 'read',
      created_at TEXT NOT NULL DEFAULT '',
      last_used  TEXT NOT NULL DEFAULT ''
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_product_id        ON alerts(product_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_status            ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level        ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_system_logs_created_at   ON system_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_platform        ON products(platform);
    CREATE INDEX IF NOT EXISTS idx_products_category        ON products(category);
  `);
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  // Ensure the data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Performance and reliability pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  createSchema(db);

  dbInstance = db;
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
