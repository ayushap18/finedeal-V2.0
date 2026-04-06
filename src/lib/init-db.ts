import { getDb } from "./sqlite-db";
import { migrateFromJson } from "./migrate";

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
}
