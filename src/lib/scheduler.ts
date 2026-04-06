import cron from "node-cron";
import { logger } from "./logger";
import { rotateLogs } from "./log-rotation";

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

    if (res.ok) {
      logger.info("scheduler", `Cron [${job.name}]: completed`, {
        endpoint: job.endpoint,
        status: res.status,
      });
    } else {
      logger.warn("scheduler", `Cron [${job.name}]: failed (${res.status})`, {
        endpoint: job.endpoint,
        status: res.status,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error("scheduler", `Cron [${job.name}]: ${errorMsg}`, {
      endpoint: job.endpoint,
      error: errorMsg,
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

  logger.info(
    "scheduler",
    `Scheduler initialized — ${JOBS.filter((j) => j.enabled).length} jobs active`,
    JOBS.filter((j) => j.enabled).map((j) => ({
      name: j.name,
      schedule: j.schedule,
    }))
  );

  // Log rotation — runs daily at 3 AM
  cron.schedule("0 3 * * *", () => {
    try {
      const deleted = rotateLogs(30);
      if (deleted > 0) {
        logger.info(
          "scheduler",
          `Log rotation: deleted ${deleted} entries older than 30 days`
        );
      }
    } catch (err) {
      logger.error(
        "scheduler",
        `Log rotation failed: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  });
  console.log("[FineDeal] Scheduled: Log Rotation (0 3 * * *)");
}

export function getScheduledJobs(): ScheduledJob[] {
  return [...JOBS];
}
