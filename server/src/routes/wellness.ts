import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

export const wellnessRouter = Router();

const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ReminderPreferences = {
  masterEnabled: boolean;
  checkIn: { enabled: boolean; hour: number; minute: number };
  vitals: { enabled: boolean; hour: number; minute: number };
  hydration: { enabled: boolean; slots: number[] };
  lunchMeal: { enabled: boolean; hour: number; minute: number };
  fitness: { enabled: boolean; hour: number; minute: number };
  careReview: { enabled: boolean; hour: number; minute: number };
  notifyNewCareAlerts: boolean;
};

const defaultReminderPreferences = (): ReminderPreferences => ({
  masterEnabled: true,
  checkIn: { enabled: true, hour: 9, minute: 0 },
  vitals: { enabled: true, hour: 10, minute: 30 },
  hydration: { enabled: true, slots: [10, 13, 16, 19] },
  lunchMeal: { enabled: false, hour: 12, minute: 30 },
  fitness: { enabled: false, hour: 17, minute: 0 },
  careReview: { enabled: true, hour: 20, minute: 0 },
  notifyNewCareAlerts: true,
});

function deepMergePrefs(
  base: ReminderPreferences,
  patch: Partial<ReminderPreferences>
): ReminderPreferences {
  return {
    masterEnabled: patch.masterEnabled ?? base.masterEnabled,
    checkIn:
      patch.checkIn != null
        ? { ...base.checkIn, ...patch.checkIn }
        : base.checkIn,
    vitals:
      patch.vitals != null
        ? { ...base.vitals, ...patch.vitals }
        : base.vitals,
    hydration:
      patch.hydration != null
        ? {
            enabled: patch.hydration.enabled ?? base.hydration.enabled,
            slots:
              patch.hydration.slots != null
                ? [...patch.hydration.slots]
                : [...base.hydration.slots],
          }
        : base.hydration,
    lunchMeal:
      patch.lunchMeal != null
        ? { ...base.lunchMeal, ...patch.lunchMeal }
        : base.lunchMeal,
    fitness:
      patch.fitness != null
        ? { ...base.fitness, ...patch.fitness }
        : base.fitness,
    careReview:
      patch.careReview != null
        ? { ...base.careReview, ...patch.careReview }
        : base.careReview,
    notifyNewCareAlerts:
      patch.notifyNewCareAlerts ?? base.notifyNewCareAlerts,
  };
}

function loadReminderPrefs(): ReminderPreferences {
  const row = db
    .prepare(`SELECT reminder_prefs_json FROM app_preferences WHERE id = 1`)
    .get() as { reminder_prefs_json: string } | undefined;
  const base = defaultReminderPreferences();
  if (!row?.reminder_prefs_json) return base;
  try {
    const parsed = JSON.parse(row.reminder_prefs_json) as Partial<ReminderPreferences>;
    return deepMergePrefs(base, parsed);
  } catch {
    return base;
  }
}

function saveReminderPrefs(prefs: ReminderPreferences) {
  db.prepare(
    `UPDATE app_preferences SET reminder_prefs_json = @json, updated_at = datetime('now') WHERE id = 1`
  ).run({ json: JSON.stringify(prefs) });
}

const prefsPatchSchema = z
  .object({
    masterEnabled: z.boolean().optional(),
    checkIn: z
      .object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .partial()
      .optional(),
    vitals: z
      .object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .partial()
      .optional(),
    hydration: z
      .object({
        enabled: z.boolean(),
        slots: z.array(z.number().int().min(0).max(23)).min(1).max(12),
      })
      .partial()
      .optional(),
    lunchMeal: z
      .object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .partial()
      .optional(),
    fitness: z
      .object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .partial()
      .optional(),
    careReview: z
      .object({
        enabled: z.boolean(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
      })
      .partial()
      .optional(),
    notifyNewCareAlerts: z.boolean().optional(),
  })
  .strict();

wellnessRouter.get("/preferences", (_req, res) => {
  res.json(loadReminderPrefs());
});

wellnessRouter.put("/preferences", (req, res) => {
  const parsed = prefsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const current = loadReminderPrefs();
  const next = deepMergePrefs(current, parsed.data as Partial<ReminderPreferences>);
  saveReminderPrefs(next);
  res.json(next);
});

const hydrationPostSchema = z.object({
  amount_ml: z.number().int().min(50).max(2000).optional(),
  note: z.string().max(500).optional(),
});

wellnessRouter.post("/hydration", (req, res) => {
  const parsed = hydrationPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const amount = parsed.data.amount_ml ?? 250;
  const info = db
    .prepare(
      `INSERT INTO hydration_logs (amount_ml, note) VALUES (@amount_ml, @note)`
    )
    .run({
      amount_ml: amount,
      note: parsed.data.note?.trim() || null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

wellnessRouter.get("/hydration/today", (_req, res) => {
  const row = db
    .prepare(
      `SELECT IFNULL(SUM(amount_ml), 0) AS total_ml, COUNT(*) AS n
       FROM hydration_logs
       WHERE date(created_at) = date('now', 'localtime')`
    )
    .get() as { total_ml: number; n: number };
  res.json({ total_ml: row.total_ml, logs: row.n });
});

wellnessRouter.get("/hydration/recent", (req, res) => {
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 14));
  const rows = db
    .prepare(
      `SELECT id, amount_ml, note, created_at
       FROM hydration_logs
       ORDER BY datetime(created_at) DESC
       LIMIT ?`
    )
    .all(limit) as {
    id: number;
    amount_ml: number;
    note: string | null;
    created_at: string;
  }[];
  res.json(rows);
});

const medPostSchema = z.object({
  label: z.string().min(1).max(200),
  schedule_times: z
    .array(z.string().regex(timeRe))
    .min(1)
    .max(6),
  enabled: z.boolean().optional(),
});

wellnessRouter.post("/medications", (req, res) => {
  const parsed = medPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const times = [...new Set(parsed.data.schedule_times)].sort();
  const info = db
    .prepare(
      `INSERT INTO medications (label, schedule_times, enabled)
       VALUES (@label, @schedule_times, @enabled)`
    )
    .run({
      label: parsed.data.label.trim(),
      schedule_times: JSON.stringify(times),
      enabled: parsed.data.enabled === false ? 0 : 1,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

wellnessRouter.get("/medications", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, label, schedule_times, enabled, created_at
       FROM medications
       ORDER BY id ASC`
    )
    .all() as {
    id: number;
    label: string;
    schedule_times: string;
    enabled: number;
    created_at: string;
  }[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      schedule_times: JSON.parse(r.schedule_times) as string[],
      enabled: r.enabled === 1,
      created_at: r.created_at,
    }))
  );
});

wellnessRouter.delete("/medications/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const info = db.prepare(`DELETE FROM medications WHERE id = ?`).run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

const medPatchSchema = z.object({
  enabled: z.boolean(),
});

wellnessRouter.patch("/medications/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = medPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const info = db
    .prepare(`UPDATE medications SET enabled = ? WHERE id = ?`)
    .run(parsed.data.enabled ? 1 : 0, id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

/** Quick rollup for dashboard / motivation. */
wellnessRouter.get("/summary", (_req, res) => {
  const hyd = db
    .prepare(
      `SELECT IFNULL(SUM(amount_ml), 0) AS total_ml FROM hydration_logs
       WHERE date(created_at) = date('now', 'localtime')`
    )
    .get() as { total_ml: number };
  const checkIns = db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS n FROM check_ins
       WHERE date(created_at) >= date('now', '-6 days', 'localtime')`
    )
    .get() as { n: number };
  const meds = db
    .prepare(
      `SELECT COUNT(*) AS n FROM medications WHERE enabled = 1`
    )
    .get() as { n: number };
  res.json({
    hydrationTodayMl: hyd.total_ml,
    checkInDaysLast7: checkIns.n,
    activeMedications: meds.n,
  });
});
