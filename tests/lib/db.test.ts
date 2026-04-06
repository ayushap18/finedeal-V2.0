import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, getCurrentDb } from "../helpers/test-db";

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

describe("db CRUD", () => {
  it("create() creates a product and returns it with id", async () => {
    const { create } = await import("@/lib/db");
    const product = create("products", {
      name: "Test Product",
      platform: "amazon",
      category: "electronics",
      url: "https://amazon.in/test",
      current_price: 999,
    });
    expect(product.id).toBeTruthy();
    expect(product.name).toBe("Test Product");
    expect(product.platform).toBe("amazon");
    expect(product.created_at).toBeTruthy();
  });

  it("getById() finds created product", async () => {
    const { create, getById } = await import("@/lib/db");
    const product = create("products", {
      name: "Find Me",
      platform: "flipkart",
      category: "books",
      url: "https://flipkart.com/test",
    });
    const found = getById("products", product.id as string);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Find Me");
  });

  it("getById() returns undefined for non-existent id", async () => {
    const { getById } = await import("@/lib/db");
    const found = getById("products", "non-existent-id");
    expect(found).toBeUndefined();
  });

  it("getAll() returns all products", async () => {
    const { create, getAll } = await import("@/lib/db");
    create("products", {
      name: "Product A",
      platform: "amazon",
      category: "",
      url: "",
    });
    create("products", {
      name: "Product B",
      platform: "flipkart",
      category: "",
      url: "",
    });
    const all = getAll("products");
    expect(all).toHaveLength(2);
  });

  it("update() modifies a product", async () => {
    const { create, update } = await import("@/lib/db");
    const product = create("products", {
      name: "Old Name",
      platform: "amazon",
      category: "",
      url: "",
    });
    const updated = update("products", product.id as string, {
      name: "New Name",
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.updated_at).toBeTruthy();
  });

  it("update() returns null for non-existent id", async () => {
    const { update } = await import("@/lib/db");
    const result = update("products", "non-existent", { name: "X" });
    expect(result).toBeNull();
  });

  it("remove() deletes a product", async () => {
    const { create, remove, getById } = await import("@/lib/db");
    const product = create("products", {
      name: "Delete Me",
      platform: "amazon",
      category: "",
      url: "",
    });
    const deleted = remove("products", product.id as string);
    expect(deleted).toBe(true);
    const found = getById("products", product.id as string);
    expect(found).toBeUndefined();
  });

  it("remove() returns false for non-existent id", async () => {
    const { remove } = await import("@/lib/db");
    const result = remove("products", "non-existent");
    expect(result).toBe(false);
  });

  it("getAllPaginated() returns correct page/total/totalPages", async () => {
    const { create, getAllPaginated } = await import("@/lib/db");
    for (let i = 0; i < 5; i++) {
      create("products", {
        name: `Product ${i}`,
        platform: "amazon",
        category: "",
        url: "",
      });
    }

    const page1 = getAllPaginated("products", { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.totalPages).toBe(3);

    const page3 = getAllPaginated("products", { page: 3, limit: 2 });
    expect(page3.data).toHaveLength(1);
    expect(page3.page).toBe(3);
  });

  it("getSettings() returns defaults when empty", async () => {
    const { getSettings } = await import("@/lib/db");
    const settings = getSettings();
    expect(settings.smtp_port).toBe(587);
    expect(settings.scrape_interval_minutes).toBe(30);
    expect(settings.notifications_enabled).toBe(false);
    expect(settings.ai_model).toBe("gemini-1.5-flash");
    expect(settings.groq_key).toBe("");
  });

  it("updateSettings() persists and returns settings", async () => {
    const { updateSettings, getSettings } = await import("@/lib/db");
    const result = updateSettings({
      user_email: "test@example.com",
      smtp_port: 465,
      notifications_enabled: true,
    });

    expect(result.user_email).toBe("test@example.com");
    expect(result.smtp_port).toBe(465);
    expect(result.notifications_enabled).toBe(true);

    const settings = getSettings();
    expect(settings.user_email).toBe("test@example.com");
    expect(settings.smtp_port).toBe(465);
  });

  it("clearCollection() empties a collection", async () => {
    const { create, clearCollection, getAll } = await import("@/lib/db");
    create("products", {
      name: "Will be cleared",
      platform: "amazon",
      category: "",
      url: "",
    });
    expect(getAll("products")).toHaveLength(1);

    clearCollection("products");
    expect(getAll("products")).toHaveLength(0);
  });

  it("alert boolean conversion: create with notify_email:true, read back as boolean", async () => {
    const { create, getById } = await import("@/lib/db");

    const product = create("products", {
      name: "Alert Test Product",
      platform: "amazon",
      category: "",
      url: "",
    });

    const alert = create("alerts", {
      product_id: product.id,
      alert_type: "price_drop",
      target_value: 500,
      notify_email: true,
      notify_telegram: false,
    });

    expect(alert.notify_email).toBe(true);
    expect(alert.notify_telegram).toBe(false);

    const fetched = getById("alerts", alert.id as string);
    expect(fetched).toBeDefined();
    expect(fetched!.notify_email).toBe(true);
    expect(fetched!.notify_telegram).toBe(false);
    expect(typeof fetched!.notify_email).toBe("boolean");
    expect(typeof fetched!.notify_telegram).toBe("boolean");
  });
});
