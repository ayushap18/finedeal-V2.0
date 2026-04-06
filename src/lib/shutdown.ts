import { closeDb } from "@/lib/sqlite-db";

let _shutdownRegistered = false;

export function registerShutdownHandlers(): void {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  const shutdown = (signal: string) => {
    console.log(`\n[FineDeal] Received ${signal}, shutting down gracefully...`);

    // Close SQLite connection
    try {
      closeDb();
      console.log("[FineDeal] Database connection closed");
    } catch (err) {
      console.error("[FineDeal] Error closing database:", err);
    }

    // Stop cron jobs (node-cron doesn't expose a global stop, but getTasks() works)
    try {
      const cron = require("node-cron");
      const tasks = cron.getTasks();
      if (tasks && tasks.size > 0) {
        for (const [, task] of tasks) {
          task.stop();
        }
        console.log(`[FineDeal] Stopped ${tasks.size} scheduled jobs`);
      }
    } catch {
      // node-cron may not support getTasks in all versions
    }

    console.log("[FineDeal] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Uncaught exceptions — log and exit
  process.on("uncaughtException", (err) => {
    console.error("[FineDeal] Uncaught exception:", err);
    try { closeDb(); } catch {}
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[FineDeal] Unhandled rejection:", reason);
    // Don't exit on unhandled rejection, just log
  });
}
