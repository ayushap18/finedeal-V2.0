import crypto from "crypto";
import { getDb } from "./sqlite-db";

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return "fd_" + crypto.randomBytes(32).toString("hex");
}

export function createApiKey(
  name: string,
  role = "admin"
): { key: string; id: string } {
  const db = getDb();
  const key = generateApiKey();
  const id = crypto.randomUUID();
  const keyHash = hashKey(key);
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO api_keys (id, key_hash, name, role, created_at, last_used)
     VALUES (?, ?, ?, ?, ?, '')`
  ).run(id, keyHash, name, role, createdAt);

  return { key, id };
}

export function validateApiKey(
  key: string
): { valid: boolean; role?: string; name?: string } {
  const db = getDb();
  const keyHash = hashKey(key);

  const row = db
    .prepare(`SELECT id, name, role FROM api_keys WHERE key_hash = ?`)
    .get(keyHash) as { id: string; name: string; role: string } | undefined;

  if (!row) return { valid: false };

  // Update last_used timestamp
  db.prepare(`UPDATE api_keys SET last_used = ? WHERE id = ?`).run(
    new Date().toISOString(),
    row.id
  );

  return { valid: true, role: row.role, name: row.name };
}

export function listApiKeys(): Array<{
  id: string;
  name: string;
  role: string;
  created_at: string;
  last_used: string;
}> {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, role, created_at, last_used FROM api_keys ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string;
    role: string;
    created_at: string;
    last_used: string;
  }>;
}

export function deleteApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM api_keys WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function ensureAdminKey(): string | null {
  const db = getDb();
  const count = (
    db.prepare(`SELECT COUNT(*) as cnt FROM api_keys`).get() as { cnt: number }
  ).cnt;

  if (count > 0) return null;

  const { key } = createApiKey("Default Admin", "admin");
  return key;
}
