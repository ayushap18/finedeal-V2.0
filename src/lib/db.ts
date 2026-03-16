import fs from "fs";
import path from "path";
import crypto from "crypto";
import { initDb } from "./init-db";
import type { DbSchema } from "./seed";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

// Ensure DB exists on module load
initDb();

function readDb(): DbSchema {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDb(data: DbSchema): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

type Collection = "products" | "price_history" | "alerts" | "system_logs";

export function getAll(collection: Collection): Record<string, unknown>[] {
  const db = readDb();
  return db[collection] as unknown as Record<string, unknown>[];
}

export function getById(collection: Collection, id: string): Record<string, unknown> | undefined {
  const items = getAll(collection);
  return items.find((item) => item.id === id);
}

export function create(collection: Collection, item: Partial<Record<string, unknown>>): Record<string, unknown> {
  const db = readDb();
  const newItem = {
    id: crypto.randomUUID(),
    ...item,
    created_at: item.created_at || new Date().toISOString(),
  };
  (db[collection] as unknown as Record<string, unknown>[]).push(newItem);
  writeDb(db);
  return newItem;
}

export function update(collection: Collection, id: string, data: Partial<Record<string, unknown>>): Record<string, unknown> | null {
  const db = readDb();
  const items = db[collection] as unknown as Record<string, unknown>[];
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...data, updated_at: new Date().toISOString() };
  writeDb(db);
  return items[idx];
}

export function remove(collection: Collection, id: string): boolean {
  const db = readDb();
  const items = db[collection] as unknown as Record<string, unknown>[];
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  writeDb(db);
  return true;
}

export function query(collection: Collection, filterFn: (item: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  return getAll(collection).filter(filterFn);
}

export function getSettings(): DbSchema["settings"] {
  const db = readDb();
  return db.settings;
}

export function updateSettings(data: Partial<DbSchema["settings"]>): DbSchema["settings"] {
  const db = readDb();
  db.settings = { ...db.settings, ...data };
  writeDb(db);
  return db.settings;
}

export function clearCollection(collection: Collection): void {
  const db = readDb();
  (db[collection] as unknown as Record<string, unknown>[]).length = 0;
  writeDb(db);
}
