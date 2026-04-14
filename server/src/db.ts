import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "vitacare.sqlite");

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mood INTEGER NOT NULL,
    mobility TEXT NOT NULL,
    sleep_quality INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nutrition_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_type TEXT NOT NULL,
    description TEXT NOT NULL,
    calories_est INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    tips TEXT,
    ai_raw TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_check_ins_created ON check_ins(created_at);
  CREATE INDEX IF NOT EXISTS idx_nutrition_created ON nutrition_logs(created_at);

  CREATE TABLE IF NOT EXISTS vital_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    heart_rate_bpm INTEGER,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    spo2_pct INTEGER,
    temperature_c REAL,
    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steps INTEGER,
    active_minutes INTEGER,
    intensity TEXT NOT NULL DEFAULT 'light',
    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sleep_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hours_slept REAL NOT NULL,
    sleep_quality INTEGER NOT NULL,
    bedtime_consistency TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS caregivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS care_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    triggered_by TEXT NOT NULL DEFAULT 'system',
    caregiver_notify_simulated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fitness_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    goals TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT 'beginner',
    preferences TEXT NOT NULL DEFAULT '',
    recovery_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fitness_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_json TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fitness_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_name TEXT NOT NULL,
    duration_minutes INTEGER,
    perceived_effort INTEGER,
    performance_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO fitness_profile (id) VALUES (1);

  CREATE INDEX IF NOT EXISTS idx_vitals_created ON vital_readings(created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sleep_created ON sleep_logs(created_at);

  CREATE TABLE IF NOT EXISTS hydration_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_ml INTEGER NOT NULL DEFAULT 250,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    schedule_times TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reminder_prefs_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO app_preferences (id, reminder_prefs_json) VALUES (1, '{}');

  CREATE INDEX IF NOT EXISTS idx_hydration_created ON hydration_logs(created_at);
`);

export type CheckInRow = {
  id: number;
  mood: number;
  mobility: string;
  sleep_quality: number | null;
  notes: string | null;
  created_at: string;
};

export type NutritionRow = {
  id: number;
  meal_type: string;
  description: string;
  calories_est: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  tips: string | null;
  ai_raw: string | null;
  created_at: string;
};
