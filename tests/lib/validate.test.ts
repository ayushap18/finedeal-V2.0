import { describe, it, expect } from "vitest";
import {
  validate,
  productSchema,
  alertSchema,
  type Schema,
} from "@/lib/validate";

describe("validate()", () => {
  // ------- Valid product data passes -------
  it("accepts valid product data", () => {
    const result = validate(
      {
        name: "iPhone 15",
        platform: "amazon",
        url: "https://amazon.in/dp/B0CHX1W1XY",
        current_price: 79999,
        original_price: 89999,
      },
      productSchema
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.name).toBe("iPhone 15");
      expect(result.data.platform).toBe("amazon");
    }
  });

  // ------- Missing required fields fails -------
  it("rejects missing required fields", () => {
    const result = validate({}, productSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("name is required");
      expect(result.errors).toContain("platform is required");
    }
  });

  // ------- Invalid email format fails -------
  it("rejects invalid email format", () => {
    const schema: Schema = { email: { type: "email", required: true } };
    const result = validate({ email: "not-an-email" }, schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("valid email");
    }
  });

  it("accepts valid email format", () => {
    const schema: Schema = { email: { type: "email", required: true } };
    const result = validate({ email: "user@example.com" }, schema);
    expect(result.valid).toBe(true);
  });

  // ------- Invalid URL format fails -------
  it("rejects invalid URL format", () => {
    const result = validate(
      { name: "Test", platform: "amazon", url: "not-a-url" },
      productSchema
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("valid URL");
    }
  });

  it("accepts valid URL format", () => {
    const schema: Schema = { link: { type: "url", required: true } };
    const result = validate({ link: "https://example.com" }, schema);
    expect(result.valid).toBe(true);
  });

  // ------- Number coercion -------
  it('coerces string "100" to number 100', () => {
    const schema: Schema = { price: { type: "number" } };
    const result = validate({ price: "100" }, schema);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.price).toBe(100);
    }
  });

  it("rejects non-numeric string for number field", () => {
    const schema: Schema = { price: { type: "number" } };
    const result = validate({ price: "abc" }, schema);
    expect(result.valid).toBe(false);
  });

  // ------- Boolean coercion -------
  it('coerces "true" to boolean true', () => {
    const schema: Schema = { flag: { type: "boolean" } };
    const result = validate({ flag: "true" }, schema);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.flag).toBe(true);
  });

  it("coerces 1 to boolean true", () => {
    const schema: Schema = { flag: { type: "boolean" } };
    const result = validate({ flag: 1 }, schema);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.flag).toBe(true);
  });

  it('coerces "false" to boolean false', () => {
    const schema: Schema = { flag: { type: "boolean" } };
    const result = validate({ flag: "false" }, schema);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.flag).toBe(false);
  });

  it("coerces 0 to boolean false", () => {
    const schema: Schema = { flag: { type: "boolean" } };
    const result = validate({ flag: 0 }, schema);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.flag).toBe(false);
  });

  it("rejects invalid boolean value", () => {
    const schema: Schema = { flag: { type: "boolean" } };
    const result = validate({ flag: "maybe" }, schema);
    expect(result.valid).toBe(false);
  });

  // ------- Enum validation -------
  it("rejects invalid platform enum value", () => {
    const result = validate(
      { name: "Test", platform: "ebay" },
      productSchema
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("must be one of");
    }
  });

  it("accepts valid platform enum value", () => {
    const result = validate(
      { name: "Test", platform: "flipkart" },
      productSchema
    );
    expect(result.valid).toBe(true);
  });

  // ------- Min/max string length -------
  it("rejects string shorter than min length", () => {
    const schema: Schema = { title: { type: "string", required: true, min: 5 } };
    const result = validate({ title: "Hi" }, schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("at least 5");
    }
  });

  it("rejects string longer than max length", () => {
    const schema: Schema = { title: { type: "string", max: 5 } };
    const result = validate({ title: "Too long string" }, schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("at most 5");
    }
  });

  // ------- Min/max number validation -------
  it("rejects number below min", () => {
    const schema: Schema = { price: { type: "number", min: 0 } };
    const result = validate({ price: -5 }, schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("at least 0");
    }
  });

  it("rejects number above max", () => {
    const schema: Schema = { price: { type: "number", max: 1000 } };
    const result = validate({ price: 5000 }, schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("at most 1000");
    }
  });

  // ------- Non-object input rejected -------
  it("rejects null input", () => {
    const result = validate(null, productSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("JSON object");
    }
  });

  it("rejects array input", () => {
    const result = validate([1, 2, 3], productSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("JSON object");
    }
  });

  it("rejects string input", () => {
    const result = validate("hello", productSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("JSON object");
    }
  });

  // ------- Trimming whitespace -------
  it("trims whitespace from string values", () => {
    const result = validate(
      { name: "  iPhone 15  ", platform: "amazon" },
      productSchema
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.name).toBe("iPhone 15");
    }
  });

  // ------- Alert schema -------
  it("accepts valid alert data", () => {
    const result = validate(
      {
        product_id: "abc-123",
        alert_type: "price_drop",
        target_value: 50000,
        notify_email: true,
        user_email: "me@example.com",
      },
      alertSchema
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing required alert fields", () => {
    const result = validate({}, alertSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("product_id is required");
      expect(result.errors).toContain("alert_type is required");
    }
  });

  it("rejects invalid alert_type enum", () => {
    const result = validate(
      { product_id: "abc", alert_type: "invalid_type" },
      alertSchema
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("must be one of");
    }
  });
});
