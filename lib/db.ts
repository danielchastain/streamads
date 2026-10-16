import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// On a host, point DATA_DIR at a persistent volume (e.g. /data) so the database and uploads survive redeploys.
export const DATA_DIR = process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export type Streamer = {
  id: number;
  twitch_id: string;
  login: string;
  display_name: string;
  avatar_url: string | null;
  overlay_token: string;
  stripe_account_id: string | null;
  payouts_enabled: number;
  created_at: number;
};

export type Slot = {
  id: number;
  streamer_id: number;
  name: string;
  price_cents: number;
  minutes: number;
  active: number;
};

export type BookingStatus =
  | "pending_payment"
  | "pending_approval"
  | "approved"
  | "completed"
  | "rejected";

export type Booking = {
  id: number;
  slot_id: number;
  streamer_id: number;
  advertiser_email: string;
  company: string;
  link_url: string | null;
  creative_file: string;
  price_cents: number;
  fee_cents: number;
  seconds_total: number;
  seconds_delivered: number;
  status: BookingStatus;
  stripe_session_id: string | null;
  payment_intent: string | null;
  payout_status: "processing" | "paid" | "failed" | null;
  transfer_id: string | null;
  refund_id: string | null;
  created_at: number;
};

function addColumn(db: Database.Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function init(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "streamads.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS streamers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitch_id TEXT UNIQUE NOT NULL,
      login TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      overlay_token TEXT UNIQUE NOT NULL,
      stripe_account_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streamer_id INTEGER NOT NULL REFERENCES streamers(id),
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      minutes INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      streamer_id INTEGER NOT NULL REFERENCES streamers(id),
      advertiser_email TEXT NOT NULL,
      company TEXT NOT NULL,
      link_url TEXT,
      creative_file TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      seconds_total INTEGER NOT NULL,
      seconds_delivered INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      stripe_session_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overlay_state (
      streamer_id INTEGER PRIMARY KEY REFERENCES streamers(id),
      last_beat_at INTEGER NOT NULL
    );
  `);
  addColumn(db, "streamers", "payouts_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "bookings", "payment_intent", "TEXT");
  addColumn(db, "bookings", "payout_status", "TEXT");
  addColumn(db, "bookings", "transfer_id", "TEXT");
  addColumn(db, "bookings", "refund_id", "TEXT");
  return db;
}

const g = globalThis as unknown as { __streamadsDb?: Database.Database };
export const db: Database.Database = (g.__streamadsDb ??= init());
