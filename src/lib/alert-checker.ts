import { getAll, getById, update, create } from "@/lib/db";
import { notify } from "@/lib/notifications";

interface CheckResult {
  checked: number;
  triggered: number;
  errors: string[];
  details: Array<{
    alert_id: string;
    product_name: string;
    result: "triggered" | "not_met" | "error";
    reason?: string;
  }>;
}

/**
 * Check if an individual alert's condition is met given the current product data.
 */
function isAlertTriggered(
  alert: Record<string, unknown>,
  product: Record<string, unknown>
): { triggered: boolean; reason: string } {
  const type = alert.alert_type as string;
  const targetValue = alert.target_value as number;
  const currentPrice = product.current_price as number;
  const originalPrice = product.original_price as number;

  switch (type) {
    case "price_drop":
      // Triggered when current price drops to or below target
      if (currentPrice <= targetValue) {
        return {
          triggered: true,
          reason: `Price ${currentPrice} ≤ target ${targetValue}`,
        };
      }
      return { triggered: false, reason: `Price ${currentPrice} > target ${targetValue}` };

    case "target_price":
      // Triggered when current price reaches or goes below target
      if (currentPrice <= targetValue) {
        return {
          triggered: true,
          reason: `Price ${currentPrice} ≤ target ${targetValue}`,
        };
      }
      return { triggered: false, reason: `Price ${currentPrice} > target ${targetValue}` };

    case "percentage_drop":
      // Triggered when drop % from original price meets or exceeds target %
      if (originalPrice > 0) {
        const dropPct = ((originalPrice - currentPrice) / originalPrice) * 100;
        if (dropPct >= targetValue) {
          return {
            triggered: true,
            reason: `Drop ${dropPct.toFixed(1)}% ≥ target ${targetValue}%`,
          };
        }
        return { triggered: false, reason: `Drop ${dropPct.toFixed(1)}% < target ${targetValue}%` };
      }
      return { triggered: false, reason: "Original price is 0" };

    case "back_in_stock":
      // Triggered when product status changes from error/paused to tracking
      if (product.status === "tracking") {
        return { triggered: true, reason: "Product is back in stock (tracking)" };
      }
      return { triggered: false, reason: `Product status: ${product.status}` };

    default:
      return { triggered: false, reason: `Unknown alert type: ${type}` };
  }
}

/**
 * Check a single alert against its product and trigger if conditions are met.
 * Returns whether the alert was triggered.
 */
export async function checkSingleAlert(
  alert: Record<string, unknown>
): Promise<{ triggered: boolean; reason: string; error?: string }> {
  try {
    const product = getById("products", alert.product_id as string);
    if (!product) {
      return { triggered: false, reason: "Product not found", error: "Product not found" };
    }

    const { triggered, reason } = isAlertTriggered(alert, product);

    if (triggered) {
      // Update alert status
      update("alerts", alert.id as string, {
        status: "triggered",
        triggered_at: new Date().toISOString(),
        current_price: product.current_price,
      });

      // Send notifications
      await notify(alert, product);

      // Log the trigger
      create("system_logs", {
        level: "success",
        message: `Alert triggered: ${alert.product_name} — ${reason}`,
        source: "alert-checker",
        details: JSON.stringify({
          alert_id: alert.id,
          alert_type: alert.alert_type,
          product_id: alert.product_id,
          current_price: product.current_price,
          target_value: alert.target_value,
        }),
      });
    }

    return { triggered, reason };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return { triggered: false, reason: "Error checking alert", error: errorMsg };
  }
}

/**
 * Check all active alerts and trigger notifications for any that meet their conditions.
 */
export async function checkAlerts(): Promise<CheckResult> {
  const result: CheckResult = {
    checked: 0,
    triggered: 0,
    errors: [],
    details: [],
  };

  try {
    const allAlerts = getAll("alerts");
    const activeAlerts = allAlerts.filter((a) => a.status === "active");
    result.checked = activeAlerts.length;

    create("system_logs", {
      level: "info",
      message: `Alert check started — ${activeAlerts.length} active alerts`,
      source: "alert-checker",
      details: `Total alerts: ${allAlerts.length}`,
    });

    for (const alert of activeAlerts) {
      const { triggered, reason, error } = await checkSingleAlert(alert);

      if (error) {
        result.errors.push(`Alert ${alert.id}: ${error}`);
        result.details.push({
          alert_id: alert.id as string,
          product_name: alert.product_name as string,
          result: "error",
          reason: error,
        });
      } else if (triggered) {
        result.triggered++;
        result.details.push({
          alert_id: alert.id as string,
          product_name: alert.product_name as string,
          result: "triggered",
          reason,
        });
      } else {
        result.details.push({
          alert_id: alert.id as string,
          product_name: alert.product_name as string,
          result: "not_met",
          reason,
        });
      }
    }

    create("system_logs", {
      level: result.errors.length > 0 ? "warning" : "success",
      message: `Alert check completed — ${result.triggered}/${result.checked} triggered, ${result.errors.length} errors`,
      source: "alert-checker",
      details: JSON.stringify({
        checked: result.checked,
        triggered: result.triggered,
        errors: result.errors,
      }),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(errorMsg);
    create("system_logs", {
      level: "error",
      message: `Alert check failed: ${errorMsg}`,
      source: "alert-checker",
      details: errorMsg,
    });
  }

  return result;
}
