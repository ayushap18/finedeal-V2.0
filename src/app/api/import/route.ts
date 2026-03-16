import { NextRequest } from "next/server";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { create, getAll } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, type } = body;

    if (!data || !Array.isArray(data)) {
      return corsError("'data' must be an array of objects", 400);
    }

    if (!type || !["products", "alerts"].includes(type)) {
      return corsError("'type' must be 'products' or 'alerts'", 400);
    }

    const results = { imported: 0, skipped: 0, errors: 0 };
    const existing = getAll(type as "products" | "alerts");

    for (const row of data) {
      try {
        if (type === "products") {
          // Check for duplicate by name
          const isDuplicate = existing.some(
            (p) => String(p.name).toLowerCase() === String(row.name || "").toLowerCase()
          );
          if (isDuplicate) {
            results.skipped++;
            continue;
          }
          create("products", {
            name: row.name || "Unknown Product",
            platform: row.platform || row.site || "unknown",
            category: row.category || "General",
            url: row.url || row.link || "",
            current_price: Number(row.current_price || row.price || 0),
            original_price: Number(row.original_price || row.mrp || row.price || 0),
            lowest_price: Number(row.lowest_price || row.price || 0),
            highest_price: Number(row.highest_price || row.price || 0),
            status: "tracking",
            last_checked: new Date().toISOString(),
          });
          results.imported++;
        } else if (type === "alerts") {
          create("alerts", {
            product_name: row.product_name || row.product || row.name || "Unknown",
            alert_type: row.alert_type || row.type || "target_price",
            target_value: Number(row.target_value || row.target || row.price || 0),
            current_price: Number(row.current_price || row.price || 0),
            notify_email: row.notify_email !== false && row.notify_email !== "false",
            notify_telegram: row.notify_telegram === true || row.notify_telegram === "true",
            status: "active",
          });
          results.imported++;
        }
      } catch {
        results.errors++;
      }
    }

    create("system_logs", {
      level: results.errors > 0 ? "warning" : "success",
      message: `CSV import: ${results.imported} ${type} imported, ${results.skipped} skipped, ${results.errors} errors`,
      source: "import",
    });

    return corsJson({ message: "Import completed", results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return corsError(`Import failed: ${msg}`, 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
