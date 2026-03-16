import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { create, getAll } from "@/lib/db";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function POST() {
  try {
    const csvPath = join(process.cwd(), "data", "pretrained-products.csv");
    if (!existsSync(csvPath)) {
      return corsError("pretrained-products.csv not found in data/", 404);
    }

    const text = readFileSync(csvPath, "utf-8");
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim());

    const existing = getAll("products");
    let imported = 0, skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });

      const name = row.name || "";
      const platform = row.platform || "";
      const key = `${name.toLowerCase()}|${platform.toLowerCase()}`;

      // Check if already exists
      const exists = existing.some(p =>
        `${String(p.name).toLowerCase()}|${String(p.platform).toLowerCase()}` === key
      );

      if (exists) { skipped++; continue; }

      create("products", {
        name,
        platform: platform.toLowerCase(),
        category: row.category || "General",
        current_price: Number(row.current_price) || 0,
        original_price: Number(row.original_price) || 0,
        lowest_price: Number(row.lowest_price) || 0,
        highest_price: Number(row.highest_price) || 0,
        url: row.url || "",
        status: "tracking",
        last_checked: new Date().toISOString(),
      });

      // Also create price history entries for a realistic 30-day history
      const basePrice = Number(row.current_price) || 0;
      const lowest = Number(row.lowest_price) || basePrice;
      const highest = Number(row.highest_price) || basePrice;

      for (let day = 30; day >= 0; day -= 3) {
        const date = new Date();
        date.setDate(date.getDate() - day);
        const variance = (Math.random() - 0.3) * (highest - lowest) * 0.3;
        const price = Math.round(Math.max(lowest, Math.min(highest, basePrice + variance)));

        create("price_history", {
          product_id: name, // Will link by name
          price,
          platform,
          date: date.toISOString(),
        });
      }

      imported++;
    }

    create("system_logs", {
      level: "success",
      message: `Pretrained data loaded: ${imported} products imported, ${skipped} skipped`,
      source: "pretrain",
    });

    return corsJson({ message: "Pretrained data loaded", imported, skipped, total: imported + skipped });
  } catch (e) {
    return corsError(`Failed to load pretrained data: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

export async function GET() {
  const csvPath = join(process.cwd(), "data", "pretrained-products.csv");
  const exists = existsSync(csvPath);
  const products = getAll("products");
  return corsJson({
    csv_exists: exists,
    total_products: products.length,
    message: exists ? "POST to this endpoint to load pretrained data" : "pretrained-products.csv not found",
  });
}

export async function OPTIONS() {
  return handleOptions();
}
