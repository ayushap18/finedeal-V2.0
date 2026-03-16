import { NextRequest } from "next/server";
import { update, remove } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = update("alerts", id, body);
    if (!updated) return corsError("Alert not found", 404);
    return corsJson({ alert: updated });
  } catch (e) {
    return corsError("Failed to update alert", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = remove("alerts", id);
    if (!deleted) return corsError("Alert not found", 404);
    return corsJson({ message: "Alert deleted" });
  } catch (e) {
    return corsError("Failed to delete alert", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
