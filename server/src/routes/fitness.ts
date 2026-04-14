import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  generateFitnessCoach,
  generateFitnessPlan,
  type FitnessPlanJson,
} from "../services/aiInsights.js";
import { buildFitnessSessionAggregate } from "../services/personalContext.js";

export const fitnessRouter = Router();

const profileSchema = z.object({
  goals: z.string().max(4000).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  preferences: z.string().max(4000).optional(),
  recovery_notes: z.string().max(4000).optional(),
});

const sessionSchema = z.object({
  workout_name: z.string().min(1).max(300),
  duration_minutes: z.number().int().min(1).max(600).optional(),
  perceived_effort: z.number().int().min(1).max(10).optional(),
  performance_notes: z.string().max(4000).optional(),
});

const coachSchema = z.object({
  exerciseName: z.string().min(1).max(300),
  userNotes: z.string().max(4000).optional(),
});

fitnessRouter.get("/profile", (_req, res) => {
  const row = db
    .prepare(
      `SELECT goals, level, preferences, recovery_notes, updated_at FROM fitness_profile WHERE id = 1`
    )
    .get() as {
    goals: string;
    level: string;
    preferences: string;
    recovery_notes: string;
    updated_at: string;
  };
  res.json(row);
});

fitnessRouter.put("/profile", (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const cur = db
    .prepare(
      `SELECT goals, level, preferences, recovery_notes FROM fitness_profile WHERE id = 1`
    )
    .get() as {
    goals: string;
    level: string;
    preferences: string;
    recovery_notes: string;
  };
  db.prepare(
    `UPDATE fitness_profile SET
       goals = @goals,
       level = @level,
       preferences = @preferences,
       recovery_notes = @recovery_notes,
       updated_at = datetime('now')
     WHERE id = 1`
  ).run({
    goals: b.goals ?? cur.goals,
    level: b.level ?? cur.level,
    preferences: b.preferences ?? cur.preferences,
    recovery_notes: b.recovery_notes ?? cur.recovery_notes,
  });
  res.json({ ok: true });
});

fitnessRouter.post("/plan", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const cur = db
      .prepare(
        `SELECT goals, level, preferences, recovery_notes FROM fitness_profile WHERE id = 1`
      )
      .get() as {
      goals: string;
      level: string;
      preferences: string;
      recovery_notes: string;
    };
    const profile = {
      goals: parsed.data.goals ?? cur.goals,
      level: parsed.data.level ?? cur.level,
      preferences: parsed.data.preferences ?? cur.preferences,
      recovery_notes: parsed.data.recovery_notes ?? cur.recovery_notes,
    };
    const trainingContext = buildFitnessSessionAggregate(14);
    const plan = await generateFitnessPlan(profile, trainingContext);
    const summary = plan.weekTheme;
    const info = db
      .prepare(
        `INSERT INTO fitness_plans (plan_json, summary) VALUES (@plan_json, @summary)`
      )
      .run({
        plan_json: JSON.stringify(plan),
        summary,
      });
    res.status(201).json({
      id: info.lastInsertRowid,
      plan,
      summary,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Plan generation failed" });
  }
});

fitnessRouter.get("/plan/latest", (_req, res) => {
  const row = db
    .prepare(
      `SELECT id, plan_json, summary, created_at FROM fitness_plans
       ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .get() as
    | {
        id: number;
        plan_json: string;
        summary: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "No plan yet" });
    return;
  }
  let plan: FitnessPlanJson;
  try {
    plan = JSON.parse(row.plan_json) as FitnessPlanJson;
  } catch {
    res.status(500).json({ error: "Stored plan corrupt" });
    return;
  }
  res.json({
    id: row.id,
    plan,
    summary: row.summary,
    createdAt: row.created_at,
  });
});

fitnessRouter.post("/sessions", (req, res) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO fitness_sessions
       (workout_name, duration_minutes, perceived_effort, performance_notes)
       VALUES (@workout_name, @duration_minutes, @perceived_effort, @performance_notes)`
    )
    .run({
      workout_name: b.workout_name,
      duration_minutes: b.duration_minutes ?? null,
      perceived_effort: b.perceived_effort ?? null,
      performance_notes: b.performance_notes ?? null,
    });
  res.status(201).json({ id: info.lastInsertRowid });
});

fitnessRouter.get("/sessions", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, workout_name, duration_minutes, perceived_effort, performance_notes, created_at
       FROM fitness_sessions ORDER BY datetime(created_at) DESC LIMIT 40`
    )
    .all();
  res.json(rows);
});

fitnessRouter.post("/coach", async (req, res) => {
  const parsed = coachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const profile = db
      .prepare(`SELECT level FROM fitness_profile WHERE id = 1`)
      .get() as { level: string };
    const recent = db
      .prepare(
        `SELECT workout_name, perceived_effort, performance_notes, created_at
         FROM fitness_sessions ORDER BY datetime(created_at) DESC LIMIT 4`
      )
      .all() as {
      workout_name: string;
      perceived_effort: number | null;
      performance_notes: string | null;
      created_at: string;
    }[];
    const recentSessionsSummary = recent
      .map(
        (r) =>
          `${r.workout_name} effort ${r.perceived_effort ?? "—"} ${r.performance_notes ?? ""}`
      )
      .join(" | ");
    const agg = buildFitnessSessionAggregate(14);
    const trainingBlob = JSON.stringify(agg);
    const coach = await generateFitnessCoach(
      parsed.data.exerciseName,
      parsed.data.userNotes ?? "",
      profile.level,
      `${recentSessionsSummary}\nrollupsJson:${trainingBlob}`
    );
    res.json(coach);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Coach generation failed" });
  }
});
