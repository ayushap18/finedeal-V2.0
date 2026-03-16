import { NextRequest } from "next/server";
import { getAll, create, getById } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import { checkAlerts, checkSingleAlert } from "@/lib/alert-checker";

export async function GET() {
  try {
    const alerts = getAll("alerts");
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const active = alerts.filter((a) => a.status === "active").length;
    const triggeredToday = alerts.filter(
      (a) => a.status === "triggered" && a.triggered_at && (a.triggered_at as string) >= todayStart
    ).length;
    const emailSent = alerts.filter((a) => a.notify_email && a.status === "triggered").length;
    const telegramSent = alerts.filter((a) => a.notify_telegram && a.status === "triggered").length;

    return corsJson({
      alerts,
      stats: { active, triggered_today: triggeredToday, email_sent: emailSent, telegram_sent: telegramSent },
      total: alerts.length,
    });
  } catch (e) {
    return corsError("Failed to fetch alerts", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Manual trigger: check all active alerts
    if (body.action === "check-all") {
      const results = await checkAlerts();
      return corsJson({
        message: `Checked ${results.checked} alerts, ${results.triggered} triggered`,
        ...results,
      });
    }

    // Create a new alert
    if (!body.product_id || !body.alert_type) {
      return corsError("product_id and alert_type are required");
    }

    // Auto-fill product info if not provided
    let productName = body.product_name;
    let platform = body.platform;
    let currentPrice = body.current_price;
    const product = getById("products", body.product_id);
    if (product) {
      productName = productName || product.name;
      platform = platform || product.platform;
      currentPrice = currentPrice ?? product.current_price;
    }

    const alert = create("alerts", {
      ...body,
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

    return corsJson({ alert, immediate_check: immediateCheck }, 201);
  } catch (e) {
    return corsError("Failed to create alert", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
