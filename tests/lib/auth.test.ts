import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, getCurrentDb } from "../helpers/test-db";

// Top-level mock — factory uses getCurrentDb which reads the module-level variable
vi.mock("@/lib/sqlite-db", () => ({
  getDb: () => getCurrentDb(),
  closeDb: () => getCurrentDb().close(),
}));

let testDb: ReturnType<typeof setupTestDb>;

beforeEach(() => {
  testDb = setupTestDb();
});

afterEach(() => {
  testDb.cleanup();
});

describe("auth", () => {
  it("generateApiKey() returns string starting with fd_", async () => {
    const { generateApiKey } = await import("@/lib/auth");
    const key = generateApiKey();
    expect(key).toMatch(/^fd_/);
    expect(key.length).toBeGreaterThan(10);
  });

  it("hashKey() returns consistent hash for same input", async () => {
    const { hashKey } = await import("@/lib/auth");
    const hash1 = hashKey("test-key");
    const hash2 = hashKey("test-key");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("hashKey() returns different hash for different input", async () => {
    const { hashKey } = await import("@/lib/auth");
    const hash1 = hashKey("key-a");
    const hash2 = hashKey("key-b");
    expect(hash1).not.toBe(hash2);
  });

  it("createApiKey() creates a key that can be validated", async () => {
    const { createApiKey, validateApiKey } = await import("@/lib/auth");
    const { key, id } = createApiKey("Test Key");
    expect(key).toMatch(/^fd_/);
    expect(id).toBeTruthy();

    const result = validateApiKey(key);
    expect(result.valid).toBe(true);
    expect(result.name).toBe("Test Key");
    expect(result.role).toBe("admin");
  });

  it("validateApiKey() returns valid:false for invalid key", async () => {
    const { validateApiKey } = await import("@/lib/auth");
    const result = validateApiKey("fd_invalid_key_that_does_not_exist");
    expect(result.valid).toBe(false);
    expect(result.role).toBeUndefined();
  });

  it("validateApiKey() updates last_used timestamp", async () => {
    const { createApiKey, validateApiKey } = await import("@/lib/auth");
    const { key, id } = createApiKey("Timestamp Test");

    const before = testDb.db
      .prepare("SELECT last_used FROM api_keys WHERE id = ?")
      .get(id) as { last_used: string | null };
    expect(!before.last_used || before.last_used === "").toBe(true);

    validateApiKey(key);

    const after = testDb.db
      .prepare("SELECT last_used FROM api_keys WHERE id = ?")
      .get(id) as { last_used: string };
    expect(after.last_used).toBeTruthy();
    expect(after.last_used.length).toBeGreaterThan(0);
  });

  it("listApiKeys() lists created keys without hashes", async () => {
    const { createApiKey, listApiKeys } = await import("@/lib/auth");
    createApiKey("Key One");
    createApiKey("Key Two");

    const keys = listApiKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0].name).toBeDefined();
    for (const k of keys) {
      expect((k as Record<string, unknown>).key_hash).toBeUndefined();
    }
  });

  it("deleteApiKey() removes a key", async () => {
    const { createApiKey, deleteApiKey, validateApiKey } = await import(
      "@/lib/auth"
    );
    const { key, id } = createApiKey("Delete Me");

    const deleted = deleteApiKey(id);
    expect(deleted).toBe(true);

    const result = validateApiKey(key);
    expect(result.valid).toBe(false);
  });

  it("deleteApiKey() returns false for non-existent id", async () => {
    const { deleteApiKey } = await import("@/lib/auth");
    const result = deleteApiKey("non-existent-id");
    expect(result).toBe(false);
  });

  it("ensureAdminKey() creates key on empty table", async () => {
    const { ensureAdminKey } = await import("@/lib/auth");
    const key = ensureAdminKey();
    expect(key).toBeTruthy();
    expect(key!).toMatch(/^fd_/);
  });

  it("ensureAdminKey() returns null when keys exist", async () => {
    const { createApiKey, ensureAdminKey } = await import("@/lib/auth");
    createApiKey("Existing Key");

    const result = ensureAdminKey();
    expect(result).toBeNull();
  });
});
