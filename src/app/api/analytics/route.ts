import { getAll } from "@/lib/db";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";

export async function GET() {
  try {
    const products = getAll("products");
    const alerts = getAll("alerts");
    const priceHistory = getAll("price_history");
    const systemLogs = getAll("system_logs");

    // Dashboard stats
    const totalProducts = products.length;
    const activeAlerts = alerts.filter((a) => a.status === "active").length;
    const priceDropsToday = products.filter(
      (p) => (p.current_price as number) < (p.original_price as number)
    ).length;

    // AI accuracy: compute from system_logs success rate for scraper/ai-engine
    const scraperLogs = systemLogs.filter((l) => l.source === "scraper" || l.source === "ai-engine");
    const successLogs = scraperLogs.filter((l) => l.level === "success");
    const aiAccuracy = scraperLogs.length > 0
      ? Math.round((successLogs.length / scraperLogs.length) * 1000) / 10
      : 0;

    // Weekly chart data (last 7 days) — computed from system_logs timestamps
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

      const scrapes = systemLogs.filter(
        (l) =>
          l.source === "scraper" &&
          (l.created_at as string) >= dayStart &&
          (l.created_at as string) < dayEnd
      ).length;

      const drops = priceHistory.filter(
        (ph) => (ph.recorded_at as string) >= dayStart && (ph.recorded_at as string) < dayEnd
      ).length;

      weeklyData.push({ day: dayStr, scrapes, price_drops: drops });
    }

    // Category breakdown — group by category, falling back to platform
    const categories: Record<string, number> = {};
    for (const p of products) {
      const cat = (p.category as string) || (p.platform as string) || "other";
      categories[cat] = (categories[cat] || 0) + 1;
    }
    const categoryBreakdown = Object.entries(categories).map(([name, count]) => ({ name, count }));

    // Trending products (highest price drop %)
    const trending = products
      .filter((p) => (p.original_price as number) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        platform: p.platform,
        current_price: p.current_price as number,
        original_price: p.original_price as number,
        drop_percentage: Math.round(
          (((p.original_price as number) - (p.current_price as number)) / (p.original_price as number)) * 100
        ),
      }))
      .sort((a, b) => b.drop_percentage - a.drop_percentage)
      .slice(0, 5);

    return corsJson({
      stats: { total_products: totalProducts, active_alerts: activeAlerts, price_drops_today: priceDropsToday, ai_accuracy: aiAccuracy },
      weekly_data: weeklyData,
      category_breakdown: categoryBreakdown,
      trending,
    });
  } catch (e) {
    return corsError("Failed to fetch analytics", 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
