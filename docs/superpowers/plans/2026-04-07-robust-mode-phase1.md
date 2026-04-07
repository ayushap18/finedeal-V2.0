# FineDeal Robust Mode — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FineDeal production-ready with SQLite database, API authentication, input validation, rate limiting, pagination, and proper error handling.

**Architecture:** Migrate from JSON flat-file to SQLite via better-sqlite3 (already installed). Add API key middleware for admin routes. Add Zod-based input validation on all write endpoints. Add in-memory rate limiter. Add pagination to list endpoints.

**Tech Stack:** better-sqlite3, Next.js middleware, crypto (built-in for API keys), Zod-like manual validation (no new deps)

---

## File Structure

### New Files
- `src/lib/sqlite-db.ts` — SQLite database layer replacing JSON file
- `src/lib/migrate.ts` — One-time migration script from JSON to SQLite
- `src/lib/auth.ts` — API key authentication helpers
- `src/lib/validate.ts` — Input validation utilities
- `src/lib/rate-limit.ts` — In-memory rate limiter
- `src/middleware.ts` — Next.js middleware for auth + rate limiting
- `src/app/api/auth/route.ts` — API key management endpoint
- `data/finedeal.db` — SQLite database file (created at runtime)

### Modified Files
- `src/lib/db.ts` — Rewrite to use SQLite instead of JSON
- `src/lib/seed.ts` — Add SQL schema definitions
- `src/lib/init-db.ts` — Initialize SQLite + run migrations
- `src/lib/api-helpers.ts` — Add pagination helpers, tighten CORS
- `src/app/api/products/route.ts` — Add validation + pagination
- `src/app/api/products/[id]/route.ts` — Add validation
- `src/app/api/alerts/route.ts` — Add validation + pagination
- `src/app/api/alerts/[id]/route.ts` — Add validation
- `src/app/api/settings/route.ts` — Add auth guard
- `src/app/api/logs/route.ts` — Add pagination
- `package.json` — Add migration script

---

### Task 1: SQLite Database Layer

**Files:**
- Create: `src/lib/sqlite-db.ts`
- Modify: `src/lib/init-db.ts`

- [ ] **Step 1: Create SQLite database initialization**

Create `src/lib/sqlite-db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "finedeal.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    _db.pragma("busy_timeout = 5000");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database): void {
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

    CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_product ON alerts(product_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_platform ON products(platform);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/sqlite-db.ts 2>&1 || echo "Check errors"`
Expected: No errors (or only path alias issues which are fine)

- [ ] **Step 3: Commit**

```bash
git add src/lib/sqlite-db.ts
git commit -m "feat: add SQLite database layer with WAL mode and schema"
```

---

### Task 2: Rewrite db.ts to Use SQLite

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Rewrite db.ts to use SQLite**

Replace the entire content of `src/lib/db.ts` with:

```typescript
import crypto from "crypto";
import { getDb } from "./sqlite-db";

type Collection = "products" | "price_history" | "alerts" | "system_logs";

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function getAll(collection: Collection): Record<string, unknown>[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ${collection} ORDER BY created_at DESC`).all();
  return collection === "alerts"
    ? rows.map(boolifyAlert)
    : rows as Record<string, unknown>[];
}

export function getAllPaginated(
  collection: Collection,
  opts: PaginationOptions = {}
): PaginatedResult<Record<string, unknown>> {
  const db = getDb();
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM ${collection}`).get() as { count: number };
  const total = countRow.count;
  const rows = db.prepare(`SELECT * FROM ${collection} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);

  const data = collection === "alerts"
    ? rows.map(boolifyAlert)
    : rows as Record<string, unknown>[];

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getById(collection: Collection, id: string): Record<string, unknown> | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return collection === "alerts" ? boolifyAlert(row) : row;
}

export function create(collection: Collection, item: Partial<Record<string, unknown>>): Record<string, unknown> {
  const db = getDb();
  const id = (item.id as string) || crypto.randomUUID();
  const created_at = (item.created_at as string) || new Date().toISOString();
  const fullItem = { ...item, id, created_at };

  if (collection === "alerts") {
    fullItem.notify_email = fullItem.notify_email ? 1 : 0;
    fullItem.notify_telegram = fullItem.notify_telegram ? 1 : 0;
  }

  const keys = Object.keys(fullItem);
  const placeholders = keys.map(() => "?").join(", ");
  const columns = keys.join(", ");
  const values = keys.map((k) => fullItem[k] ?? null);

  db.prepare(`INSERT INTO ${collection} (${columns}) VALUES (${placeholders})`).run(...values);

  return getById(collection, id) || fullItem;
}

export function update(collection: Collection, id: string, data: Partial<Record<string, unknown>>): Record<string, unknown> | null {
  const db = getDb();
  const existing = getById(collection, id);
  if (!existing) return null;

  const updateData = { ...data, updated_at: new Date().toISOString() };
  delete updateData.id;

  if (collection === "alerts") {
    if ("notify_email" in updateData) updateData.notify_email = updateData.notify_email ? 1 : 0;
    if ("notify_telegram" in updateData) updateData.notify_telegram = updateData.notify_telegram ? 1 : 0;
  }

  const keys = Object.keys(updateData);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => updateData[k] ?? null);

  db.prepare(`UPDATE ${collection} SET ${setClause} WHERE id = ?`).run(...values, id);

  return getById(collection, id) || null;
}

export function remove(collection: Collection, id: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM ${collection} WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function query(collection: Collection, filterFn: (item: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  return getAll(collection).filter(filterFn);
}

export function getSettings(): Record<string, string> & { notifications_enabled: boolean; smtp_port: number; scrape_interval_minutes: number } {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return {
    groq_key: (settings.groq_key as string) || "",
    gemini_key: (settings.gemini_key as string) || "",
    smtp_host: (settings.smtp_host as string) || "",
    smtp_port: parseInt((settings.smtp_port as string) || "587", 10),
    smtp_user: (settings.smtp_user as string) || "",
    smtp_pass: (settings.smtp_pass as string) || "",
    telegram_bot_token: (settings.telegram_bot_token as string) || "",
    telegram_chat_id: (settings.telegram_chat_id as string) || "",
    user_email: (settings.user_email as string) || "",
    scrape_interval_minutes: parseInt((settings.scrape_interval_minutes as string) || "30", 10),
    ai_model: (settings.ai_model as string) || "gemini-1.5-flash",
    notifications_enabled: (settings.notifications_enabled as string) !== "false",
  } as Record<string, string> & { notifications_enabled: boolean; smtp_port: number; scrape_interval_minutes: number };
}

export function updateSettings(data: Partial<Record<string, unknown>>): ReturnType<typeof getSettings> {
  const db = getDb();
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const txn = db.transaction((entries: Array<[string, string]>) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });

  const entries = Object.entries(data).map(([k, v]) => [k, String(v)] as [string, string]);
  txn(entries);

  return getSettings();
}

export function clearCollection(collection: Collection): void {
  const db = getDb();
  db.prepare(`DELETE FROM ${collection}`).run();
}

function boolifyAlert(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    notify_email: Boolean(row.notify_email),
    notify_telegram: Boolean(row.notify_telegram),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: rewrite db.ts to use SQLite with pagination support"
```

---

### Task 3: JSON-to-SQLite Migration Script

**Files:**
- Create: `src/lib/migrate.ts`
- Modify: `src/lib/init-db.ts`
- Modify: `package.json`

- [ ] **Step 1: Create migration script**

Create `src/lib/migrate.ts`:

```typescript
import fs from "fs";
import path from "path";
import { getDb } from "./sqlite-db";

const JSON_DB_PATH = path.join(process.cwd(), "data", "db.json");

interface JsonDb {
  products: Record<string, unknown>[];
  price_history: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  system_logs: Record<string, unknown>[];
  settings: Record<string, unknown>;
}

export function migrateFromJson(): { migrated: boolean; counts: Record<string, number> } {
  if (!fs.existsSync(JSON_DB_PATH)) {
    return { migrated: false, counts: {} };
  }

  const db = getDb();
  const existingProducts = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };

  if (existingProducts.count > 0) {
    return { migrated: false, counts: { existing_products: existingProducts.count } };
  }

  const raw = fs.readFileSync(JSON_DB_PATH, "utf-8");
  const jsonDb: JsonDb = JSON.parse(raw);
  const counts: Record<string, number> = {};

  const txn = db.transaction(() => {
    // Products
    if (jsonDb.products?.length) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO products (id, name, platform, category, url, image_url, current_price, original_price, lowest_price, highest_price, currency, status, last_checked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const p of jsonDb.products) {
        stmt.run(p.id, p.name, p.platform, p.category || "", p.url || "", p.image_url || "", p.current_price || 0, p.original_price || 0, p.lowest_price || 0, p.highest_price || 0, p.currency || "INR", p.status || "tracking", p.last_checked || "", p.created_at || new Date().toISOString());
      }
      counts.products = jsonDb.products.length;
    }

    // Price history
    if (jsonDb.price_history?.length) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO price_history (id, product_id, price, currency, recorded_at) VALUES (?, ?, ?, ?, ?)`);
      for (const ph of jsonDb.price_history) {
        stmt.run(ph.id, ph.product_id, ph.price, ph.currency || "INR", ph.recorded_at || new Date().toISOString());
      }
      counts.price_history = jsonDb.price_history.length;
    }

    // Alerts
    if (jsonDb.alerts?.length) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO alerts (id, product_id, product_name, platform, alert_type, target_value, current_price, status, notify_email, notify_telegram, triggered_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const a of jsonDb.alerts) {
        stmt.run(a.id, a.product_id, a.product_name || "", a.platform || "", a.alert_type, a.target_value || 0, a.current_price || 0, a.status || "active", a.notify_email ? 1 : 0, a.notify_telegram ? 1 : 0, a.triggered_at || null, a.created_at || new Date().toISOString());
      }
      counts.alerts = jsonDb.alerts.length;
    }

    // System logs
    if (jsonDb.system_logs?.length) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO system_logs (id, level, message, source, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const l of jsonDb.system_logs) {
        stmt.run(l.id, l.level, l.message, l.source || "", l.details || "", l.created_at || new Date().toISOString());
      }
      counts.system_logs = jsonDb.system_logs.length;
    }

    // Settings
    if (jsonDb.settings) {
      const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      for (const [key, value] of Object.entries(jsonDb.settings)) {
        stmt.run(key, String(value));
      }
      counts.settings = Object.keys(jsonDb.settings).length;
    }
  });

  txn();

  // Rename old JSON file as backup
  const backupPath = JSON_DB_PATH.replace(".json", ".json.bak");
  fs.renameSync(JSON_DB_PATH, backupPath);

  return { migrated: true, counts };
}
```

- [ ] **Step 2: Update init-db.ts to use SQLite + auto-migrate**

Replace `src/lib/init-db.ts`:

```typescript
import { getDb } from "./sqlite-db";
import { migrateFromJson } from "./migrate";

let _initialized = false;

export function initDb(): void {
  if (_initialized) return;
  _initialized = true;

  // Initialize SQLite (creates schema if needed)
  getDb();

  // Auto-migrate from JSON if it exists
  const result = migrateFromJson();
  if (result.migrated) {
    console.log("[FineDeal] Migrated from JSON to SQLite:", result.counts);
  }
}
```

- [ ] **Step 3: Add migration script to package.json**

Add to `package.json` scripts:

```json
"migrate": "npx tsx src/lib/migrate.ts"
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/migrate.ts src/lib/init-db.ts package.json
git commit -m "feat: add JSON-to-SQLite migration with auto-migrate on startup"
```

---

### Task 4: API Key Authentication

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/route.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Create auth utilities**

Create `src/lib/auth.ts`:

```typescript
import crypto from "crypto";
import { getDb } from "./sqlite-db";

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return `fd_${crypto.randomBytes(32).toString("hex")}`;
}

export function createApiKey(name: string, role: string = "admin"): { key: string; id: string } {
  const db = getDb();
  const key = generateApiKey();
  const id = crypto.randomUUID();
  const keyHash = hashKey(key);

  db.prepare(
    "INSERT INTO api_keys (id, key_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, keyHash, name, role, new Date().toISOString());

  return { key, id };
}

export function validateApiKey(key: string): { valid: boolean; role?: string; name?: string } {
  if (!key) return { valid: false };

  const db = getDb();
  const keyHash = hashKey(key);
  const row = db.prepare("SELECT id, name, role FROM api_keys WHERE key_hash = ?").get(keyHash) as { id: string; name: string; role: string } | undefined;

  if (!row) return { valid: false };

  // Update last_used
  db.prepare("UPDATE api_keys SET last_used = ? WHERE id = ?").run(new Date().toISOString(), row.id);

  return { valid: true, role: row.role, name: row.name };
}

export function listApiKeys(): Array<{ id: string; name: string; role: string; created_at: string; last_used: string | null }> {
  const db = getDb();
  return db.prepare("SELECT id, name, role, created_at, last_used FROM api_keys ORDER BY created_at DESC").all() as Array<{ id: string; name: string; role: string; created_at: string; last_used: string | null }>;
}

export function deleteApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Ensure at least one admin key exists. Called on startup.
 * Returns the key only on first creation (printed to console).
 */
export function ensureAdminKey(): string | null {
  const db = getDb();
  const existing = db.prepare("SELECT COUNT(*) as count FROM api_keys").get() as { count: number };
  if (existing.count > 0) return null;

  const { key } = createApiKey("Default Admin", "admin");
  return key;
}
```

- [ ] **Step 2: Create auth API endpoint**

Create `src/app/api/auth/route.ts`:

```typescript
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { validateApiKey, listApiKeys, createApiKey, deleteApiKey } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const authResult = checkAuth(req);
  if (!authResult.valid) return corsError("Unauthorized", 401);

  const keys = listApiKeys();
  return corsJson({ keys });
}

export async function POST(req: NextRequest) {
  const authResult = checkAuth(req);
  if (!authResult.valid) return corsError("Unauthorized", 401);

  const body = await req.json();
  if (!body.name) return corsError("name is required");

  const { key, id } = createApiKey(body.name, body.role || "admin");
  return corsJson({ id, key, message: "Save this key — it won't be shown again" }, 201);
}

export async function DELETE(req: NextRequest) {
  const authResult = checkAuth(req);
  if (!authResult.valid) return corsError("Unauthorized", 401);

  const { id } = await req.json();
  if (!id) return corsError("id is required");

  const deleted = deleteApiKey(id);
  return deleted ? corsJson({ success: true }) : corsError("Key not found", 404);
}

export async function OPTIONS() {
  return handleOptions();
}

function checkAuth(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const key = header.replace("Bearer ", "");
  return validateApiKey(key);
}
```

- [ ] **Step 3: Create Next.js middleware for auth + rate limiting**

Create `src/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

// Paths that require authentication (admin APIs)
const PROTECTED_PATHS = [
  "/api/settings",
  "/api/auth",
  "/api/logs",
  "/api/import",
  "/api/pretrain",
];

// Paths open to extension/public (read-heavy)
const PUBLIC_PATHS = [
  "/api/products",
  "/api/alerts",
  "/api/scraper",
  "/api/ai",
  "/api/analytics",
  "/api/notify",
  "/api/telegram",
  "/api/users",
  "/api/cron",
];

// In-memory rate limit store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

function getRateLimitKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Rate limiting
  const clientKey = getRateLimitKey(req);
  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        },
      }
    );
  }

  // Auth check for protected paths
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected) {
    const authHeader = req.headers.get("authorization") || "";

    // Allow if ADMIN_KEY env var matches (bootstrap scenario)
    const envAdminKey = process.env.ADMIN_KEY || "";
    const bearerToken = authHeader.replace("Bearer ", "");

    if (!bearerToken) {
      return NextResponse.json(
        { error: "Authentication required. Provide Authorization: Bearer <api_key>" },
        {
          status: 401,
          headers: { "Access-Control-Allow-Origin": req.headers.get("origin") || "*" },
        }
      );
    }

    // Env-based admin key for bootstrap (before DB keys exist)
    if (envAdminKey && bearerToken === envAdminKey) {
      return NextResponse.next();
    }

    // DB-based key validation happens in the route handler
    // Middleware can't use better-sqlite3 in edge runtime,
    // so we pass through and let route handlers validate
  }

  // Add CORS headers to response
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", req.headers.get("origin") || "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/route.ts src/middleware.ts
git commit -m "feat: add API key auth, rate limiting middleware, and auth endpoint"
```

---

### Task 5: Input Validation Utilities

**Files:**
- Create: `src/lib/validate.ts`

- [ ] **Step 1: Create validation helpers (no external deps)**

Create `src/lib/validate.ts`:

```typescript
type ValidationResult = { valid: true; data: Record<string, unknown> } | { valid: false; errors: string[] };

type FieldRule = {
  type: "string" | "number" | "boolean" | "email" | "url";
  required?: boolean;
  min?: number;
  max?: number;
  enum?: string[];
};

type Schema = Record<string, FieldRule>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;

export function validate(data: unknown, schema: Schema): ValidationResult {
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  const input = data as Record<string, unknown>;
  const errors: string[] = [];
  const cleaned: Record<string, unknown> = {};

  for (const [field, rule] of Object.entries(schema)) {
    const value = input[field];

    if (value === undefined || value === null || value === "") {
      if (rule.required) {
        errors.push(`${field} is required`);
      }
      continue;
    }

    switch (rule.type) {
      case "string": {
        if (typeof value !== "string") {
          errors.push(`${field} must be a string`);
          break;
        }
        const trimmed = value.trim();
        if (rule.min !== undefined && trimmed.length < rule.min) {
          errors.push(`${field} must be at least ${rule.min} characters`);
        }
        if (rule.max !== undefined && trimmed.length > rule.max) {
          errors.push(`${field} must be at most ${rule.max} characters`);
        }
        if (rule.enum && !rule.enum.includes(trimmed)) {
          errors.push(`${field} must be one of: ${rule.enum.join(", ")}`);
        }
        cleaned[field] = trimmed;
        break;
      }
      case "number": {
        const num = typeof value === "number" ? value : Number(value);
        if (isNaN(num)) {
          errors.push(`${field} must be a number`);
          break;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors.push(`${field} must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push(`${field} must be at most ${rule.max}`);
        }
        cleaned[field] = num;
        break;
      }
      case "boolean": {
        cleaned[field] = Boolean(value);
        break;
      }
      case "email": {
        if (typeof value !== "string" || !EMAIL_RE.test(value.trim())) {
          errors.push(`${field} must be a valid email address`);
          break;
        }
        cleaned[field] = value.trim().toLowerCase();
        break;
      }
      case "url": {
        if (typeof value !== "string" || !URL_RE.test(value.trim())) {
          errors.push(`${field} must be a valid URL starting with http(s)://`);
          break;
        }
        cleaned[field] = value.trim();
        break;
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: cleaned };
}

// Pre-built schemas for common endpoints
export const productSchema: Schema = {
  name: { type: "string", required: true, min: 1, max: 500 },
  platform: { type: "string", required: true, enum: ["amazon", "flipkart", "croma", "myntra", "ajio", "snapdeal", "tatacliq", "nykaa", "vijaysales"] },
  category: { type: "string", max: 100 },
  url: { type: "url" },
  current_price: { type: "number", min: 0 },
  original_price: { type: "number", min: 0 },
};

export const alertSchema: Schema = {
  product_id: { type: "string", required: true },
  alert_type: { type: "string", required: true, enum: ["price_drop", "target_price", "percentage_drop", "back_in_stock"] },
  target_value: { type: "number", min: 0 },
  notify_email: { type: "boolean" },
  notify_telegram: { type: "boolean" },
  user_email: { type: "email" },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validate.ts
git commit -m "feat: add input validation utilities with pre-built schemas"
```

---

### Task 6: Update API Routes with Validation + Pagination

**Files:**
- Modify: `src/app/api/products/route.ts`
- Modify: `src/app/api/alerts/route.ts`
- Modify: `src/app/api/logs/route.ts`
- Modify: `src/lib/api-helpers.ts`

- [ ] **Step 1: Update api-helpers with CORS and pagination**

Replace `src/lib/api-helpers.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

function getAllowedOrigin(req: NextRequest): string {
  const origin = req.headers.get("origin") || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  if (allowed.includes("*")) return origin || "*";
  return allowed.includes(origin) ? origin : allowed[0] || "*";
}

function corsHeaders(req: NextRequest) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function corsJson(data: unknown, status = 200, req?: NextRequest) {
  const headers = req ? corsHeaders(req) : {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return NextResponse.json(data, { status, headers });
}

export function corsError(message: string, status = 400, req?: NextRequest) {
  const headers = req ? corsHeaders(req) : {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return NextResponse.json({ error: message }, { status, headers });
}

export function handleOptions(req?: NextRequest) {
  const headers = req ? corsHeaders(req) : {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}

export function parseSearchParams(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function parsePagination(req: NextRequest): { page: number; limit: number } {
  const params = parseSearchParams(req);
  return {
    page: Math.max(1, parseInt(params.page || "1", 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(params.limit || "20", 10) || 20)),
  };
}
```

- [ ] **Step 2: Update products route with validation + pagination**

Replace `src/app/api/products/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getAll, getAllPaginated, create } from "@/lib/db";
import { corsJson, corsError, handleOptions, parseSearchParams, parsePagination } from "@/lib/api-helpers";
import { validate, productSchema } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const { search, category, platform, page, limit } = parseSearchParams(req);

    // If filters are provided, use in-memory filtering (SQLite WHERE would be better long-term)
    if (search || category || platform) {
      let products = getAll("products");
      if (search) {
        const s = search.toLowerCase();
        products = products.filter((p) => (p.name as string).toLowerCase().includes(s));
      }
      if (category) products = products.filter((p) => p.category === category);
      if (platform) products = products.filter((p) => p.platform === platform);
      return corsJson({ products, total: products.length });
    }

    // Paginated response
    const pagination = parsePagination(req);
    const result = getAllPaginated("products", pagination);
    return corsJson({
      products: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (e) {
    return corsError("Failed to fetch products", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = validate(body, productSchema);
    if (!validation.valid) {
      return corsError(validation.errors.join("; "), 400);
    }

    const product = create("products", {
      ...validation.data,
      ...body, // Keep extra fields that aren't in schema (image_url, etc.)
      name: validation.data.name,
      platform: validation.data.platform,
      status: body.status || "tracking",
      currency: body.currency || "INR",
      current_price: validation.data.current_price || body.current_price || 0,
      original_price: validation.data.original_price || body.original_price || 0,
      lowest_price: body.lowest_price || body.current_price || 0,
      highest_price: body.highest_price || body.current_price || 0,
      last_checked: new Date().toISOString(),
    });
    return corsJson({ product }, 201);
  } catch (e) {
    return corsError("Failed to create product", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
```

- [ ] **Step 3: Update alerts route with validation + pagination**

Read and update `src/app/api/alerts/route.ts` to add validation on POST and pagination on GET — same pattern as products.

- [ ] **Step 4: Update logs route with pagination**

Read and update `src/app/api/logs/route.ts` to add pagination on GET.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-helpers.ts src/app/api/products/route.ts src/app/api/alerts/route.ts src/app/api/logs/route.ts
git commit -m "feat: add input validation, pagination, and tighter CORS to API routes"
```

---

### Task 7: Update init-db.ts and Bootstrap Admin Key

**Files:**
- Modify: `src/lib/init-db.ts`

- [ ] **Step 1: Update init-db to bootstrap admin key on first run**

Replace `src/lib/init-db.ts`:

```typescript
import { getDb } from "./sqlite-db";
import { migrateFromJson } from "./migrate";
import { ensureAdminKey } from "./auth";

let _initialized = false;

export function initDb(): void {
  if (_initialized) return;
  _initialized = true;

  // Initialize SQLite (creates schema if needed)
  getDb();

  // Auto-migrate from JSON if it exists
  const result = migrateFromJson();
  if (result.migrated) {
    console.log("[FineDeal] Migrated from JSON to SQLite:", result.counts);
  }

  // Ensure an admin API key exists
  const adminKey = ensureAdminKey();
  if (adminKey) {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║  FineDeal Admin API Key (save this, shown once):    ║");
    console.log(`║  ${adminKey}  ║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/init-db.ts
git commit -m "feat: bootstrap admin API key on first startup"
```

---

### Task 8: Build Verification

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: Build completes successfully

- [ ] **Step 2: Fix any TypeScript errors found during build**

Address each error individually, ensuring no regressions.

- [ ] **Step 3: Run the dev server and verify migration works**

Run: `npm run dev`
Expected: Server starts, JSON data migrates to SQLite, admin key is printed to console.

- [ ] **Step 4: Test key API endpoints manually**

```bash
# Test products endpoint (public, should work without auth)
curl http://localhost:3000/api/products

# Test settings endpoint (protected, should return 401)
curl http://localhost:3000/api/settings

# Test with auth
curl -H "Authorization: Bearer <admin_key>" http://localhost:3000/api/settings

# Test rate limiting (rapid requests)
for i in {1..65}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/products; done
```

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build and runtime issues from robust mode migration"
```
