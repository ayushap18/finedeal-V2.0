import { getDb } from "@/lib/sqlite-db";
import fs from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const MAX_BACKUPS = 7; // Keep last 7 backups

/**
 * Create a backup of the SQLite database using the SQLite backup API.
 * Returns the path to the backup file.
 */
export function createBackup(): { path: string; sizeBytes: number } {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `finedeal-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  const db = getDb();
  db.backup(backupPath);

  const stats = fs.statSync(backupPath);

  // Prune old backups
  pruneBackups();

  return { path: backupPath, sizeBytes: stats.size };
}

/**
 * Remove old backups beyond the retention limit.
 */
function pruneBackups(): number {
  if (!fs.existsSync(BACKUP_DIR)) return 0;

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("finedeal-") && f.endsWith(".db"))
    .map((f) => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  let deleted = 0;
  for (let i = MAX_BACKUPS; i < files.length; i++) {
    fs.unlinkSync(files[i].path);
    deleted++;
  }

  return deleted;
}

/**
 * List existing backups.
 */
export function listBackups(): Array<{
  name: string;
  sizeBytes: number;
  createdAt: string;
}> {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("finedeal-") && f.endsWith(".db"))
    .map((f) => {
      const filePath = path.join(BACKUP_DIR, f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
