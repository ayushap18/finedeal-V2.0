import { getDb } from "@/lib/sqlite-db";

/**
 * Delete system logs older than `days` days.
 * Returns the number of rows deleted.
 */
export function rotateLogs(days: number = 30): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const result = db
    .prepare("DELETE FROM system_logs WHERE created_at < ?")
    .run(cutoffStr);
  return result.changes;
}

/**
 * Get the current size of the system_logs table.
 */
export function getLogStats(): {
  count: number;
  oldestEntry: string | null;
} {
  const db = getDb();
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM system_logs")
    .get() as { count: number };
  const oldest = db
    .prepare("SELECT MIN(created_at) as oldest FROM system_logs")
    .get() as { oldest: string | null };
  return { count, oldestEntry: oldest.oldest };
}
