import fs from "fs";
import path from "path";
import { getSeedData } from "./seed";

const DB_PATH = path.join(process.cwd(), "data", "db.json");
const DATA_DIR = path.dirname(DB_PATH);

export function initDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = getSeedData();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), "utf-8");
  }
}
