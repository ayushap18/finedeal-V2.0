import cron from "node-cron";
import { create } from "@/lib/db";

let _scheduled = false;

interface ScheduledJob {
  name: string;
  schedule: string;
  endpoint: string;
  enabled: boolean;
}

const JOBS: ScheduledJob[] = [
  {
    name: "Price Scraper",
    schedule: "*/30 * * * *", // Every 30 minutes
    endpoint: "/api/cron/scrape",
    enabled: true,
  },
  {
    name: "Alert Checker",
    schedule: "*/15 * * * *", // Every 15 minutes
    endpoint: "/api/cron",
    enabled: true,
  },
  {
    name: "Daily Digest",
    schedule: "0 9 * * *", // Every day at 9 AM
    endpoint: "/api/cron/digest",
    enabled: true,
  },
  {
    name: "Telegram Poller",
    schedule: "*/5 * * * *", // Every 5 minutes
    endpoint: "/api/cron/telegram",
    enabled: true,
  },
];

function getBaseUrl(): string {
  return process.env.BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

async function triggerEndpoint(job: ScheduledJob): Promise<void> {
  const url = `${getBaseUrl()}${job.endpoint}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Cron-Secret": process.env.CRON_SECRET || "",
      },
    });

    create("system_logs", {
      level: res.ok ? "info" : "warning",
      message: `Cron [${job.name}]: ${res.ok ? "completed" : `failed (${res.status})`}`,
      source: "scheduler",
      details: JSON.stringify({ endpoint: job.endpoint, status: res.status }),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    create("system_logs", {
      level: "error",
      message: `Cron [${job.name}]: ${errorMsg}`,
      source: "scheduler",
      details: JSON.stringify({ endpoint: job.endpoint, error: errorMsg }),
    });
  }
}

export function initScheduler(): void {
  if (_scheduled) return;
  if (process.env.NODE_ENV === "test") return; // Don't run cron in tests
  _scheduled = true;

  for (const job of JOBS) {
    if (!job.enabled) continue;

    cron.schedule(job.schedule, () => {
      triggerEndpoint(job);
    });

    console.log(`[FineDeal] Scheduled: ${job.name} (${job.schedule})`);
  }

  create("system_logs", {
    level: "info",
    message: `Scheduler initialized — ${JOBS.filter((j) => j.enabled).length} jobs active`,
    source: "scheduler",
    details: JSON.stringify(
      JOBS.filter((j) => j.enabled).map((j) => ({ name: j.name, schedule: j.schedule }))
    ),
  });
}

export function getScheduledJobs(): ScheduledJob[] {
  return [...JOBS];
}
