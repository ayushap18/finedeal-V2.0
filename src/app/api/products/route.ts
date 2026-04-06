import { NextRequest } from "next/server";
import { getAll, getAllPaginated, create } from "@/lib/db";
import {
  corsJson,
  corsError,
  handleOptions,
  parseSearchParams,
  parsePagination,
} from "@/lib/api-helpers";
import { validate, productSchema } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const { search, category, platform } = parseSearchParams(req);
    const hasFilters = !!(search || category || platform);

    if (hasFilters) {
      // In-memory filter — return all matches without pagination
      let products = getAll("products");
      if (search) {
        const s = search.toLowerCase();
        products = products.filter((p) =>
          (p.name as string).toLowerCase().includes(s)
        );
      }
      if (category) products = products.filter((p) => p.category === category);
      if (platform) products = products.filter((p) => p.platform === platform);
      return corsJson({ products, total: products.length }, 200, req);
    }

    // No filters — use paginated DB query
    const { page, limit } = parsePagination(req);
    const result = getAllPaginated("products", { page, limit });
    return corsJson(
      {
        products: result.data,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      200,
      req
    );
  } catch {
    return corsError("Failed to fetch products", 500, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate with schema — returns 400 with error list on failure
    const result = validate(body, productSchema);
    if (!result.valid) {
      return corsJson({ errors: result.errors }, 400, req);
    }

    const validated = result.data;
    const product = create("products", {
      ...body,       // keep any extra caller fields (e.g. url, image_url)
      ...validated,  // override with sanitised / validated values
      status: body.status || "tracking",
      currency: body.currency || "INR",
      current_price: validated.current_price ?? body.current_price ?? 0,
      original_price: validated.original_price ?? body.original_price ?? 0,
      lowest_price:
        body.lowest_price ??
        validated.current_price ??
        body.current_price ??
        0,
      highest_price:
        body.highest_price ??
        validated.current_price ??
        body.current_price ??
        0,
      last_checked: new Date().toISOString(),
    });

    return corsJson({ product }, 201, req);
  } catch {
    return corsError("Failed to create product", 500, req);
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}
