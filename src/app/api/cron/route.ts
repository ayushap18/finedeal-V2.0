import { checkAlerts } from "@/lib/alert-checker";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";

export async function GET() {
  try {
    const results = await checkAlerts();
    return corsJson({
      message: `Alert check complete: ${results.triggered}/${results.checked} triggered`,
      ...results,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return corsError(`Cron job failed: ${msg}`, 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
