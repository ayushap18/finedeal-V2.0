import { getDb } from "./sqlite-db";
import { migrateFromJson } from "./migrate";
import { ensureAdminKey } from "./auth";

let _initialized = false;

export function initDb(): void {
  if (_initialized) return;
  _initialized = true;

  // Ensure the SQLite database exists with the full schema
  getDb();

  // Migrate data from db.json if it hasn't been done yet
  const result = migrateFromJson();

  if (result.migrated) {
    const { products, price_history, alerts, system_logs, settings } =
      result.counts;
    console.log(
      `[init-db] Migration from db.json completed: ` +
        `${products} products, ${price_history} price_history rows, ` +
        `${alerts} alerts, ${system_logs} system_logs, ${settings} settings keys`
    );
    console.log("[init-db] Original db.json renamed to db.json.bak");
  } else {
    console.log(
      "[init-db] SQLite database ready (no migration needed)"
    );
  }

  // Bootstrap a default admin API key on first run
  const adminKey = ensureAdminKey();
  if (adminKey) {
    const line1 = "║  FineDeal Admin API Key (save this, shown once only):                  ║";
    const line2 = `║  ${adminKey}  ║`;
    console.log("╔══════════════════════════════════════════════════════════════════════════╗");
    console.log(line1);
    console.log(line2);
    console.log("╚══════════════════════════════════════════════════════════════════════════╝");
  }
}
