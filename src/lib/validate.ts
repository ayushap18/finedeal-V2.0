// Input validation utilities — zero external dependencies

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_RE = /^https?:\/\/.+/;

export type FieldRule = {
  type: "string" | "number" | "boolean" | "email" | "url";
  required?: boolean;
  min?: number;
  max?: number;
  enum?: string[];
};

export type Schema = Record<string, FieldRule>;

export type ValidationResult =
  | { valid: true; data: Record<string, unknown> }
  | { valid: false; errors: string[] };

export function validate(data: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  const input = data as Record<string, unknown>;

  for (const [field, rule] of Object.entries(schema)) {
    let value = input[field];

    // Handle missing / undefined values
    if (value === undefined || value === null || value === "") {
      if (rule.required) {
        errors.push(`${field} is required`);
      }
      continue;
    }

    // Type coercion and validation
    switch (rule.type) {
      case "string":
      case "email":
      case "url": {
        if (typeof value !== "string") {
          errors.push(`${field} must be a string`);
          continue;
        }
        value = (value as string).trim();
        if (value === "") {
          if (rule.required) {
            errors.push(`${field} is required`);
          }
          continue;
        }
        if (rule.type === "email" && !EMAIL_RE.test(value as string)) {
          errors.push(`${field} must be a valid email address`);
          continue;
        }
        if (rule.type === "url" && !URL_RE.test(value as string)) {
          errors.push(`${field} must be a valid URL starting with http:// or https://`);
          continue;
        }
        if (rule.min !== undefined && (value as string).length < rule.min) {
          errors.push(`${field} must be at least ${rule.min} character(s)`);
          continue;
        }
        if (rule.max !== undefined && (value as string).length > rule.max) {
          errors.push(`${field} must be at most ${rule.max} character(s)`);
          continue;
        }
        if (rule.enum && !rule.enum.includes(value as string)) {
          errors.push(`${field} must be one of: ${rule.enum.join(", ")}`);
          continue;
        }
        out[field] = value;
        break;
      }

      case "number": {
        const coerced = typeof value === "number" ? value : Number(value);
        if (isNaN(coerced)) {
          errors.push(`${field} must be a number`);
          continue;
        }
        if (rule.min !== undefined && coerced < rule.min) {
          errors.push(`${field} must be at least ${rule.min}`);
          continue;
        }
        if (rule.max !== undefined && coerced > rule.max) {
          errors.push(`${field} must be at most ${rule.max}`);
          continue;
        }
        out[field] = coerced;
        break;
      }

      case "boolean": {
        if (typeof value === "boolean") {
          out[field] = value;
        } else if (value === "true" || value === 1 || value === "1") {
          out[field] = true;
        } else if (value === "false" || value === 0 || value === "0") {
          out[field] = false;
        } else {
          errors.push(`${field} must be a boolean`);
          continue;
        }
        break;
      }

      default:
        errors.push(`${field} has an unknown type in schema`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: out };
}

// ---------------------------------------------------------------------------
// Pre-built schemas
// ---------------------------------------------------------------------------

export const productSchema: Schema = {
  name: { type: "string", required: true, min: 1, max: 500 },
  platform: {
    type: "string",
    required: true,
    enum: [
      "amazon",
      "flipkart",
      "croma",
      "myntra",
      "ajio",
      "snapdeal",
      "tatacliq",
      "nykaa",
      "vijaysales",
    ],
  },
  category: { type: "string", max: 100 },
  url: { type: "url" },
  current_price: { type: "number", min: 0 },
  original_price: { type: "number", min: 0 },
};

export const alertSchema: Schema = {
  product_id: { type: "string", required: true },
  alert_type: {
    type: "string",
    required: true,
    enum: ["price_drop", "target_price", "percentage_drop", "back_in_stock"],
  },
  target_value: { type: "number", min: 0 },
  notify_email: { type: "boolean" },
  notify_telegram: { type: "boolean" },
  user_email: { type: "email" },
};
