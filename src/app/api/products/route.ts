import { NextRequest } from "next/server";
import { getAll, create, query } from "@/lib/db";
import { corsJson, corsError, handleOptions, parseSearchParams } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { search, category, platform } = parseSearchParams(req);
    let products = getAll("products");

    if (search) {
      const s = search.toLowerCase();
      products = products.filter((p) =>
        (p.name as string).toLowerCase().includes(s)
      );
    }
    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (platform) {
      products = products.filter((p) => p.platform === platform);
    }

    return corsJson({ products, total: products.length });
  } catch (e) {
    return corsError("Failed to fetch products", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.platform || !body.url) {
      return corsError("name, platform, and url are required");
    }
    const product = create("products", {
      ...body,
      status: body.status || "tracking",
      currency: body.currency || "INR",
      current_price: body.current_price || 0,
      original_price: body.original_price || 0,
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
