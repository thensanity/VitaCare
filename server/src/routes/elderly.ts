import { Router } from "express";
import { z } from "zod";
import { db, type CheckInRow } from "../db.js";
import type { ElderlyInsightInput } from "../services/aiInsights.js";
import { generateElderlyMonitoringInsight } from "../services/aiInsights.js";
import { buildElderlyPersonalBaselines } from "../services/personalContext.js";

export const elderlyRouter = Router();

const checkInSchema = z.object({
  mood: z.number().min(1).max(5),
  mobility: z.enum(["independent", "cane", "walker", "wheelchair", "assisted"]),
  sleep_quality: z.number().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
});

const vitalSchema = z.object({
  heart_rate_bpm: z.number().int().min(30).max(220).optional(),
  bp_systolic: z.number().int().min(60).max(250).optional(),
  bp_diastolic: z.number().int().min(40).max(200).optional(),
  spo2_pct: z.number().int().min(70).max(100).optional(),
  temperature_c: z.number().min(30).max(43).optional(),
  source: z.enum(["manual", "device", "apple_health", "health_connect"]).optional(),
  notes: z.string().max(1000).optional(),
});

const activitySchema = z.object({
  steps: z.number().int().min(0).optional(),
  active_minutes: z.number().int().min(0).optional(),
  intensity: z.enum(["light", "moderate", "vigorous"]).optional(),
  source: z.enum(["manual", "device", "apple_health", "health_connect"]).optional(),
  notes: z.string().max(1000).optional(),
});

const sleepLogSchema = z.object({
  hours_slept: z.number().min(0).max(24),
  sleep_quality: z.number().min(1).max(5),
  bedtime_consistency: z
    .enum(["regular", "irregular", "unknown"])
    .optional(),
  notes: z.string().max(1000).optional(),
});

const caregiverSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(5).max(40),
  relation: z.string().max(120).optional(),
});

const manualAlertSchema = z.object({
  severity: z.enum(["info", "watch", "emergency"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(4000),
});

function loadMonitoringInput() {
  const recentCheckIns = db
    .prepare(
      `SELECT mood, mobility, sleep_quality, notes, created_at
       FROM check_ins ORDER BY datetime(created_at) DESC LIMIT 14`
    )
    .all() as ElderlyInsightInput["recentCheckIns"];

  const recentVitals = db
    .prepare(
      `SELECT heart_rate_bpm, bp_systolic, bp_diastolic, spo2_pct, temperature_c, notes, created_at
       FROM vital_readings ORDER BY datetime(created_at) DESC LIMIT 20`
    )
    .all() as {
    heart_rate_bpm: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    spo2_pct: number | null;
    temperature_c: number | null;
    notes: string | null;
    created_at: string;
  }[];

  const recentActivity = db
    .prepare(
      `SELECT steps, active_minutes, intensity, notes, created_at
       FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 14`
    )
    .all() as {
    steps: number | null;
    active_minutes: number | null;
    intensity: string;
    notes: string | null;
    created_at: string;
  }[];

  const recentSleep = db
    .prepare(
      `SELECT hours_slept, sleep_quality, bedtime_consistency, notes, created_at
       FROM sleep_logs ORDER BY datetime(created_at) DESC LIMIT 14`
    )
    .all() as {
    hours_slept: number;
    sleep_quality: number;
    bedtime_consistency: string | null;
    notes: string | null;
    created_at: string;
  }[];

  return {
    recentCheckIns,
    recentVitals,
    recentActivity,
    recentSleep,
  };
}

function maybeRecordSystemAlert(result: {
  caregiverAlertSuggested: boolean;
  caregiverAlertReason: string;
  earlyWarnings: string[];
}) {
  if (!result.caregiverAlertSuggested) return;

  const recent = db
    .prepare(
      `SELECT id FROM care_alerts
       WHERE triggered_by = 'system'
         AND datetime(created_at) > datetime('now', '-4 hours')
       LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (recent) return;

  const caregivers = db
    .prepare(`SELECT COUNT(*) AS c FROM caregivers`)
    .get() as { c: number };
  const notify = caregivers.c > 0 ? 1 : 0;
  const detail =
    [result.caregiverAlertReason, ...result.earlyWarnings]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 3900) || "Automated wellness watch from latest trend data.";

  db.prepare(
    `INSERT INTO care_alerts (severity, title, detail, triggered_by, caregiver_notify_simulated)
     VALUES ('watch', @title, @detail, 'system', @notify)`
  ).run({
    title: "AI monitoring: review suggested",
    detail,
    notify,
  });
}

elderlyRouter.post("/check-ins", (req, res) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { mood, mobility, sleep_quality, notes } = parsed.data;
  const stmt = db.prepare(
    `INSERT INTO check_ins (mood, mobility, sleep_quality, notes)
     VALUES (@mood, @mobility, @sleep_quality, @notes)`
  );
  const info = stmt.run({
    mood,
    mobility,
    sleep_quality: sleep_quality ?? null,
    notes: notes ?? null,
  });
  res.status(201).json({ id: info.lastInsertRowid });
});

elderlyRouter.get("/check-ins", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, mood, mobility, sleep_quality, notes, created_at
       FROM check_ins ORDER BY datetime(created_at) DESC LIMIT 60`
    )
    .all() as CheckInRow[];
  res.json(rows);
});

elderlyRouter.post("/vitals", (req, res) => {
  const parsed = vitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const hasAny =
    b.heart_rate_bpm != null ||
    b.bp_systolic != null ||
    b.bp_diastolic != null ||
    b.spo2_pct != null ||
    b.temperature_c != null ||
    (b.notes != null && b.notes.trim().length > 0);
  if (!hasAny) {
    res.status(400).json({ error: "Provide at least one vital, or notes." });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO vital_readings
       (heart_rate_bpm, bp_systolic, bp_diastolic, spo2_pct, temperature_c, source, notes)
       VALUES (@heart_rate_bpm, @bp_systolic, @bp_diastolic, @spo2_pct, @temperature_c, @source, @notes)`
    )
    .run({
      heart_rate_bpm: b.heart_rate_bpm ?? null,
      bp_systolic: b.bp_systolic ?? null,
      bp_diastolic: b.bp_diastolic ?? null,
      spo2_pct: b.spo2_pct ?? null,
      temperature_c: b.temperature_c ?? null,
      source: b.source ?? "manual",
      notes: b.notes ?? null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

elderlyRouter.get("/vitals", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, heart_rate_bpm, bp_systolic, bp_diastolic, spo2_pct, temperature_c, source, notes, created_at
       FROM vital_readings ORDER BY datetime(created_at) DESC LIMIT 60`
    )
    .all();
  res.json(rows);
});

elderlyRouter.post("/activity", (req, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const hasAny =
    b.steps != null || b.active_minutes != null || (b.notes != null && b.notes.trim().length > 0);
  if (!hasAny) {
    res.status(400).json({ error: "Provide steps, active minutes, or notes." });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO activity_logs (steps, active_minutes, intensity, source, notes)
       VALUES (@steps, @active_minutes, @intensity, @source, @notes)`
    )
    .run({
      steps: b.steps ?? null,
      active_minutes: b.active_minutes ?? null,
      intensity: b.intensity ?? "light",
      source: b.source ?? "manual",
      notes: b.notes ?? null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

elderlyRouter.get("/activity", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, steps, active_minutes, intensity, source, notes, created_at
       FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 60`
    )
    .all();
  res.json(rows);
});

elderlyRouter.post("/sleep-logs", (req, res) => {
  const parsed = sleepLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO sleep_logs (hours_slept, sleep_quality, bedtime_consistency, notes)
       VALUES (@hours_slept, @sleep_quality, @bedtime_consistency, @notes)`
    )
    .run({
      hours_slept: b.hours_slept,
      sleep_quality: b.sleep_quality,
      bedtime_consistency: b.bedtime_consistency ?? null,
      notes: b.notes ?? null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

elderlyRouter.get("/sleep-logs", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, hours_slept, sleep_quality, bedtime_consistency, notes, created_at
       FROM sleep_logs ORDER BY datetime(created_at) DESC LIMIT 60`
    )
    .all();
  res.json(rows);
});

elderlyRouter.post("/caregivers", (req, res) => {
  const parsed = caregiverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO caregivers (name, phone, relation) VALUES (@name, @phone, @relation)`
    )
    .run({
      name: b.name,
      phone: b.phone,
      relation: b.relation ?? null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

elderlyRouter.get("/caregivers", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, phone, relation, created_at FROM caregivers ORDER BY id ASC`
    )
    .all();
  res.json(rows);
});

elderlyRouter.delete("/caregivers/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const info = db.prepare(`DELETE FROM caregivers WHERE id = ?`).run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

elderlyRouter.post("/alerts", (req, res) => {
  const parsed = manualAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const caregivers = db
    .prepare(`SELECT COUNT(*) AS c FROM caregivers`)
    .get() as { c: number };
  const notify = caregivers.c > 0 ? 1 : 0;
  const info = db
    .prepare(
      `INSERT INTO care_alerts (severity, title, detail, triggered_by, caregiver_notify_simulated)
       VALUES (@severity, @title, @detail, 'user', @notify)`
    )
    .run({
      severity: b.severity,
      title: b.title,
      detail: b.detail,
      notify,
    });
  res.status(201).json({
    id: info.lastInsertRowid,
    caregiverNotifySimulated: notify === 1,
  });
});

elderlyRouter.get("/alerts", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, severity, title, detail, triggered_by, caregiver_notify_simulated, created_at
       FROM care_alerts ORDER BY datetime(created_at) DESC LIMIT 50`
    )
    .all();
  res.json(rows);
});

elderlyRouter.get("/insight", async (_req, res) => {
  try {
    const input = {
      ...loadMonitoringInput(),
      personalBaselines: buildElderlyPersonalBaselines(21),
    };
    const result = await generateElderlyMonitoringInsight(input);
    maybeRecordSystemAlert(result);
    res.json({
      insight: result.insight,
      earlyWarnings: result.earlyWarnings,
      caregiverAlertSuggested: result.caregiverAlertSuggested,
      caregiverAlertReason: result.caregiverAlertReason,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Insight generation failed" });
  }
});
