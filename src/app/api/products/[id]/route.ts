import { NextRequest } from "next/server";
import { getById, update, remove, query } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = getById("products", id);
    if (!product) return corsError("Product not found", 404);

    const history = query("price_history", (ph) => ph.product_id === id);
    return corsJson({ product, price_history: history });
  } catch (e) {
    return corsError("Failed to fetch product", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = update("products", id, body);
    if (!updated) return corsError("Product not found", 404);
    return corsJson({ product: updated });
  } catch (e) {
    return corsError("Failed to update product", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = remove("products", id);
    if (!deleted) return corsError("Product not found", 404);
    return corsJson({ message: "Product deleted" });
  } catch (e) {
    return corsError("Failed to delete product", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
