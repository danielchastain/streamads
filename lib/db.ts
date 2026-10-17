import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Position } from "./ad-geometry";

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
  disabled: number;
  created_at: number;
};

export type Slot = {
  id: number;
  streamer_id: number;
  name: string;
  price_cents: number;
  minutes: number;
  active: number;
  width: number;
  height: number;
  position: Position;
};

export { POSITIONS, MAX_AD_WIDTH, MAX_AD_HEIGHT } from "./ad-geometry";
export type { Position } from "./ad-geometry";

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
  completed_at: number | null; // when all minutes were delivered (starts the payout hold)
  payout_hold: number; // 1 = an admin is holding this booking's payout
  last_credited_at: number | null; // last time airtime was counted
  proof_waived: number; // 1 = an admin released this payout without VOD proof
};

/** Where in a Twitch VOD a booking's airtime can be checked. */
export type Proof = {
  booking_id: number;
  vod_id: string;
  offset_s: number; // seconds into the VOD when this booking first aired
  seconds: number; // airtime credited inside this VOD
  last_at: number;
  source: "auto" | "manual"; // recorded by the overlay checks, or sent in by the streamer and verified with Twitch
};

function addColumn(db: Database.Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (err) {
    // `next build` starts many workers at once, and each runs this setup against the same file. If another one
    // added the column between our check and our ALTER, that's fine: it exists, which is all we wanted.
    if (!/duplicate column name/i.test(String((err as Error).message))) throw err;
  }
}

function init(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "streamads.db"), { timeout: 10_000 }); // wait out other processes' locks
  try {
    db.pragma("journal_mode = WAL");
  } catch {
    // Another process (e.g. a parallel `next build` worker) is switching the file's mode right now. WAL is a
    // preference, not a requirement, and whoever wins the race sets it.
  }
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
    CREATE TABLE IF NOT EXISTS booking_proofs (
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      vod_id TEXT NOT NULL,
      offset_s INTEGER NOT NULL,
      seconds INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (booking_id, vod_id)
    );
  `);
  // Last Twitch check made while the overlay was running (null = never / not applicable).
  addColumn(db, "booking_proofs", "source", "TEXT NOT NULL DEFAULT 'auto'");
  addColumn(db, "overlay_state", "tw_live", "INTEGER");
  addColumn(db, "overlay_state", "tw_vod", "INTEGER");
  addColumn(db, "overlay_state", "tw_checked_at", "INTEGER");
  addColumn(db, "bookings", "completed_at", "INTEGER");
  addColumn(db, "bookings", "payout_hold", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "bookings", "last_credited_at", "INTEGER");
  addColumn(db, "bookings", "proof_waived", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "streamers", "payouts_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "streamers", "disabled", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "bookings", "payment_intent", "TEXT");
  addColumn(db, "bookings", "payout_status", "TEXT");
  addColumn(db, "bookings", "transfer_id", "TEXT");
  addColumn(db, "bookings", "refund_id", "TEXT");
  addColumn(db, "slots", "width", "INTEGER NOT NULL DEFAULT 420");
  addColumn(db, "slots", "height", "INTEGER NOT NULL DEFAULT 140");
  addColumn(db, "slots", "position", "TEXT NOT NULL DEFAULT 'bottom-left'");
  return db;
}

const g = globalThis as unknown as { __streamadsDb?: Database.Database };
const open = () => (g.__streamadsDb ??= init());

// Opened on first use, not when this file loads: `next build` imports every page in many parallel workers, and
// they would all race to create and migrate the same database file (which once broke a deploy). Nothing here
// needs the database at build time.
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = open() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
