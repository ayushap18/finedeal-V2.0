import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";

/** Shared reference that the mock factory can access. */
let _currentDb: Database.Database | null = null;

export function getCurrentDb(): Database.Database {
  if (!_currentDb) throw new Error("Test DB not initialized — call setupTestDb() in beforeEach");
  return _currentDb;
}

export function setupTestDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finedeal-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      current_price REAL NOT NULL DEFAULT 0,
      original_price REAL NOT NULL DEFAULT 0,
      lowest_price REAL NOT NULL DEFAULT 0,
      highest_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'tracking',
      last_checked TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      alert_type TEXT NOT NULL,
      target_value REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notify_email INTEGER NOT NULL DEFAULT 0,
      notify_telegram INTEGER NOT NULL DEFAULT 0,
      user_email TEXT DEFAULT '',
      telegram_chat_id TEXT DEFAULT '',
      triggered_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT
    );
  `);

  _currentDb = db;

  return {
    db,
    cleanup: () => {
      _currentDb = null;
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
