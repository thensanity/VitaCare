import { Router } from "express";
import { z } from "zod";
import { db, type NutritionRow } from "../db.js";
import { analyzeMealDescription } from "../services/aiInsights.js";
import { buildNutritionPersonalContext } from "../services/personalContext.js";

export const nutritionRouter = Router();

const logSchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().min(3).max(2000),
});

nutritionRouter.post("/logs", async (req, res) => {
  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const personal = buildNutritionPersonalContext();
    const analysis = await analyzeMealDescription(
      parsed.data.description,
      parsed.data.meal_type,
      personal
    );
    const stmt = db.prepare(
      `INSERT INTO nutrition_logs
       (meal_type, description, calories_est, protein_g, carbs_g, fat_g, tips, ai_raw)
       VALUES (@meal_type, @description, @calories_est, @protein_g, @carbs_g, @fat_g, @tips, @ai_raw)`
    );
    const ai_raw = JSON.stringify(analysis);
    const info = stmt.run({
      meal_type: parsed.data.meal_type,
      description: parsed.data.description,
      calories_est: analysis.calories_est,
      protein_g: analysis.protein_g,
      carbs_g: analysis.carbs_g,
      fat_g: analysis.fat_g,
      tips: analysis.tips,
      ai_raw,
    });
    res.status(201).json({
      id: info.lastInsertRowid,
      ...analysis,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Meal analysis failed" });
  }
});

nutritionRouter.get("/logs", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, meal_type, description, calories_est, protein_g, carbs_g, fat_g, tips, created_at
       FROM nutrition_logs ORDER BY datetime(created_at) DESC LIMIT 100`
    )
    .all() as NutritionRow[];
  res.json(rows);
});

nutritionRouter.get("/summary/today", (_req, res) => {
  const row = db
    .prepare(
      `SELECT
         IFNULL(SUM(calories_est), 0) AS calories,
         IFNULL(SUM(protein_g), 0) AS protein,
         IFNULL(SUM(carbs_g), 0) AS carbs,
         IFNULL(SUM(fat_g), 0) AS fat,
         COUNT(*) AS meals
       FROM nutrition_logs
       WHERE date(created_at) = date('now', 'localtime')`
    )
    .get() as {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meals: number;
  };
  res.json(row);
});
