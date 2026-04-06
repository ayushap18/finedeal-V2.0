import { NextRequest } from "next/server";
import { getAll, getAllPaginated, create, getById } from "@/lib/db";
import {
  corsJson,
  corsError,
  handleOptions,
  parsePagination,
} from "@/lib/api-helpers";
import { checkAlerts, checkSingleAlert } from "@/lib/alert-checker";
import { validate, alertSchema } from "@/lib/validate";

export async function GET(req: NextRequest) {
  try {
    const { page, limit } = parsePagination(req);
    const result = getAllPaginated("alerts", { page, limit });

    // Compute stats from the full collection (not just the current page)
    const allAlerts = getAll("alerts");
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();

    const active = allAlerts.filter((a) => a.status === "active").length;
    const triggeredToday = allAlerts.filter(
      (a) =>
        a.status === "triggered" &&
        a.triggered_at &&
        (a.triggered_at as string) >= todayStart
    ).length;
    const emailSent = allAlerts.filter(
      (a) => a.notify_email && a.status === "triggered"
    ).length;
    const telegramSent = allAlerts.filter(
      (a) => a.notify_telegram && a.status === "triggered"
    ).length;

    return corsJson(
      {
        alerts: result.data,
        stats: {
          active,
          triggered_today: triggeredToday,
          email_sent: emailSent,
          telegram_sent: telegramSent,
        },
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      200,
      req
    );
  } catch {
    return corsError("Failed to fetch alerts", 500, req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Manual trigger: check all active alerts (no schema validation needed)
    if (body.action === "check-all") {
      const results = await checkAlerts();
      return corsJson({
        message: `Checked ${results.checked} alerts, ${results.triggered} triggered`,
        ...results,
      }, 200, req);
    }

    // Validate body with alertSchema
    const validation = validate(body, alertSchema);
    if (!validation.valid) {
      return corsJson({ errors: validation.errors }, 400, req);
    }

    const validated = validation.data;

    // Auto-fill product info if not provided
    let productName = body.product_name;
    let platform = body.platform;
    let currentPrice = body.current_price;
    const product = getById("products", validated.product_id as string);
    if (product) {
      productName = productName || product.name;
      platform = platform || product.platform;
      currentPrice = currentPrice ?? product.current_price;
    }

    const alert = create("alerts", {
      ...body,
      ...validated,
      product_name: productName,
      platform,
      current_price: currentPrice,
      status: "active",
      triggered_at: null,
    });

    // Immediately check if this new alert should trigger
    let immediateCheck = null;
    if (product) {
      const checkResult = await checkSingleAlert(alert);
      if (checkResult.triggered) {
        immediateCheck = {
          triggered: true,
          reason: checkResult.reason,
        };
      }
    }

    return corsJson({ alert, immediate_check: immediateCheck }, 201, req);
  } catch {
    return corsError("Failed to create alert", 500, req);
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}
