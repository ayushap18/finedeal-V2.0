import crypto from "crypto";
import { getDb } from "./sqlite-db";
import type { Settings } from "./seed";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Collection = "products" | "price_history" | "alerts" | "system_logs";

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert SQLite INTEGER (0/1) boolean fields to JS boolean for alerts rows. */
function boolifyAlert(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    notify_email: Boolean(row.notify_email),
    notify_telegram: Boolean(row.notify_telegram),
  };
}

/** Apply boolifyAlert only when working with the alerts collection. */
function postProcess(
  collection: Collection,
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (collection === "alerts") return rows.map(boolifyAlert);
  return rows;
}

/** Convert boolean fields back to 0/1 before writing alert data to SQLite. */
function prepareAlertData(
  data: Partial<Record<string, unknown>>
): Partial<Record<string, unknown>> {
  const result = { ...data };
  if ("notify_email" in result)
    result.notify_email = result.notify_email ? 1 : 0;
  if ("notify_telegram" in result)
    result.notify_telegram = result.notify_telegram ? 1 : 0;
  return result;
}

/** Prepare write data for a collection (only alerts needs special handling). */
function prepareData(
  collection: Collection,
  data: Partial<Record<string, unknown>>
): Partial<Record<string, unknown>> {
  if (collection === "alerts") return prepareAlertData(data);
  return data;
}

// ---------------------------------------------------------------------------
// Core CRUD exports
// ---------------------------------------------------------------------------

export function getAll(collection: Collection): Record<string, unknown>[] {
  const db = getDb();
  // price_history uses recorded_at instead of created_at
  const orderCol = collection === "price_history" ? "recorded_at" : "created_at";
  const rows = db
    .prepare(`SELECT * FROM ${collection} ORDER BY ${orderCol} DESC`)
    .all() as Record<string, unknown>[];
  return postProcess(collection, rows);
}

export function getById(
  collection: Collection,
  id: string
): Record<string, unknown> | undefined {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM ${collection} WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return postProcess(collection, [row])[0];
}

export function create(
  collection: Collection,
  item: Partial<Record<string, unknown>>
): Record<string, unknown> {
  const db = getDb();
  const now = new Date().toISOString();
  const newItem = prepareData(collection, {
    id: crypto.randomUUID(),
    ...item,
    created_at: item.created_at ?? now,
  });

  const keys = Object.keys(newItem);
  const placeholders = keys.map(() => "?").join(", ");
  const cols = keys.join(", ");
  const values = keys.map((k) => newItem[k]);

  db.prepare(
    `INSERT INTO ${collection} (${cols}) VALUES (${placeholders})`
  ).run(...values);

  // Return the freshly inserted row (with boolean conversion if needed)
  return getById(collection, newItem.id as string)!;
}

export function update(
  collection: Collection,
  id: string,
  data: Partial<Record<string, unknown>>
): Record<string, unknown> | null {
  const db = getDb();
  const prepared = prepareData(collection, {
    ...data,
    updated_at: new Date().toISOString(),
  });

  const keys = Object.keys(prepared);
  if (keys.length === 0) return getById(collection, id) ?? null;

  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => prepared[k]);

  const result = db
    .prepare(`UPDATE ${collection} SET ${setClause} WHERE id = ?`)
    .run(...values, id);

  if (result.changes === 0) return null;
  return getById(collection, id) ?? null;
}

export function remove(collection: Collection, id: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM ${collection} WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

/** Backward-compatible in-memory filter over getAll results. */
export function query(
  collection: Collection,
  filterFn: (item: Record<string, unknown>) => boolean
): Record<string, unknown>[] {
  return getAll(collection).filter(filterFn);
}

export function clearCollection(collection: Collection): void {
  const db = getDb();
  db.prepare(`DELETE FROM ${collection}`).run();
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function getAllPaginated<T = Record<string, unknown>>(
  collection: Collection,
  opts: PaginationOptions = {}
): PaginatedResult<T> {
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.max(1, opts.limit ?? 20);
  const offset = (page - 1) * limit;

  const orderCol = collection === "price_history" ? "recorded_at" : "created_at";

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM ${collection}`)
    .get() as { total: number };

  const rows = db
    .prepare(
      `SELECT * FROM ${collection} ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Record<string, unknown>[];

  const data = postProcess(collection, rows) as T[];
  const totalPages = Math.ceil(total / limit);

  return { data, total, page, limit, totalPages };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const NUMERIC_SETTINGS = new Set(["smtp_port", "scrape_interval_minutes"]);
const BOOLEAN_SETTINGS = new Set(["notifications_enabled"]);

function rowsToSettings(rows: { key: string; value: string }[]): Settings {
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    groq_key: map.groq_key ?? "",
    gemini_key: map.gemini_key ?? "",
    smtp_host: map.smtp_host ?? "",
    smtp_port: Number(map.smtp_port ?? 587),
    smtp_user: map.smtp_user ?? "",
    smtp_pass: map.smtp_pass ?? "",
    telegram_bot_token: map.telegram_bot_token ?? "",
    telegram_chat_id: map.telegram_chat_id ?? "",
    user_email: map.user_email ?? "",
    scrape_interval_minutes: Number(map.scrape_interval_minutes ?? 30),
    ai_model: map.ai_model ?? "gemini-1.5-flash",
    notifications_enabled: map.notifications_enabled === "true",
  };
}

export function getSettings(): Settings {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM settings")
    .all() as { key: string; value: string }[];
  return rowsToSettings(rows);
}

export function updateSettings(data: Partial<Settings>): Settings {
  const db = getDb();

  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  const runAll = db.transaction((entries: [string, unknown][]) => {
    for (const [key, val] of entries) {
      let stored: string;
      if (BOOLEAN_SETTINGS.has(key)) {
        stored = val ? "true" : "false";
      } else if (NUMERIC_SETTINGS.has(key)) {
        stored = String(Number(val));
      } else {
        stored = String(val ?? "");
      }
      upsert.run(key, stored);
    }
  });

  runAll(Object.entries(data));
  return getSettings();
}
