import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";

export interface ExtensionUser {
  id: string;
  email?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
  browser: string;
  extension_version: string;
  first_seen: string;
  last_active: string;
  products_tracked: number;
  alerts_count: number;
  status: "active" | "inactive";
}

const USERS_PATH = join(process.cwd(), "data", "users.json");

function readUsers(): ExtensionUser[] {
  if (!existsSync(USERS_PATH)) {
    writeFileSync(USERS_PATH, "[]", "utf-8");
    return [];
  }
  return JSON.parse(readFileSync(USERS_PATH, "utf-8"));
}

function writeUsers(users: ExtensionUser[]): void {
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

export function getAllUsers(): ExtensionUser[] {
  return readUsers();
}

export function getUserById(id: string): ExtensionUser | undefined {
  return readUsers().find((u) => u.id === id);
}

export function registerUser(data: {
  email?: string;
  telegram_chat_id?: string;
  telegram_username?: string;
  browser?: string;
  extension_version?: string;
}): ExtensionUser | null {
  // Don't create empty users - require at least email or telegram
  if (!data.email && !data.telegram_chat_id && !data.telegram_username) {
    return null;
  }

  const users = readUsers();

  // Check if user already exists by email or telegram
  const existing = users.find(
    (u) =>
      (data.email && u.email === data.email) ||
      (data.telegram_chat_id && u.telegram_chat_id === data.telegram_chat_id)
  );

  if (existing) {
    // Update last active and merge data
    existing.last_active = new Date().toISOString();
    if (data.email) existing.email = data.email;
    if (data.telegram_chat_id) existing.telegram_chat_id = data.telegram_chat_id;
    if (data.telegram_username) existing.telegram_username = data.telegram_username;
    if (data.browser) existing.browser = data.browser;
    if (data.extension_version) existing.extension_version = data.extension_version;
    existing.status = "active";
    writeUsers(users);
    return existing;
  }

  const newUser: ExtensionUser = {
    id: crypto.randomUUID(),
    email: data.email,
    telegram_chat_id: data.telegram_chat_id,
    telegram_username: data.telegram_username,
    browser: data.browser || "Chrome",
    extension_version: data.extension_version || "4.0.0",
    first_seen: new Date().toISOString(),
    last_active: new Date().toISOString(),
    products_tracked: 0,
    alerts_count: 0,
    status: "active",
  };

  users.push(newUser);
  writeUsers(users);
  return newUser;
}

export function updateUser(id: string, data: Partial<ExtensionUser>): ExtensionUser | null {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...data, last_active: new Date().toISOString() };
  writeUsers(users);
  return users[idx];
}

export function getUserStats(): {
  total: number;
  active: number;
  with_email: number;
  with_telegram: number;
} {
  const users = readUsers();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    total: users.length,
    active: users.filter((u) => now - new Date(u.last_active).getTime() < 7 * dayMs).length,
    with_email: users.filter((u) => !!u.email).length,
    with_telegram: users.filter((u) => !!u.telegram_chat_id).length,
  };
}
