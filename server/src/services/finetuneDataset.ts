import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../db.js";
import { NUTRITION_MEAL_SYSTEM_PROMPT } from "../prompts/nutritionMeal.js";
import type { NutritionPersonalContext } from "./personalContext.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type FinetuneChatRow = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
};

/** Nutrition history strictly before this log (same logic as live personalization). */
export function nutritionContextBeforeTimestamp(
  beforeIso: string
): NutritionPersonalContext {
  const hist = db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(calories_est) AS c_avg,
              MIN(calories_est) AS c_min,
              MAX(calories_est) AS c_max,
              AVG(protein_g) AS p_avg,
              AVG(carbs_g) AS cb_avg,
              AVG(fat_g) AS f_avg
       FROM nutrition_logs
       WHERE datetime(created_at) > datetime(?, '-21 days')
         AND datetime(created_at) < datetime(?)`
    )
    .get(beforeIso, beforeIso) as {
    n: number;
    c_avg: number | null;
    c_min: number | null;
    c_max: number | null;
    p_avg: number | null;
    cb_avg: number | null;
    f_avg: number | null;
  };

  const streak = db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS d
       FROM nutrition_logs
       WHERE datetime(created_at) < datetime(?)
         AND date(created_at) >= date(?, '-6 days')`
    )
    .get(beforeIso, beforeIso) as { d: number };

  const dayPrefix = beforeIso.slice(0, 10);
  const today = db
    .prepare(
      `SELECT
         IFNULL(SUM(calories_est), 0) AS calories,
         IFNULL(SUM(protein_g), 0) AS protein,
         IFNULL(SUM(carbs_g), 0) AS carbs,
         IFNULL(SUM(fat_g), 0) AS fat,
         COUNT(*) AS meals
       FROM nutrition_logs
       WHERE date(created_at) = date(?)
         AND datetime(created_at) < datetime(?)`
    )
    .get(dayPrefix, beforeIso) as {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meals: number;
  };

  return {
    windowDays: 21,
    logged_meals: hist.n,
    avg_calories_per_meal:
      hist.c_avg != null ? Math.round(hist.c_avg * 10) / 10 : null,
    min_calories_per_meal_21d:
      hist.c_min != null ? Math.round(hist.c_min) : null,
    max_calories_per_meal_21d:
      hist.c_max != null ? Math.round(hist.c_max) : null,
    avg_protein_g_per_meal:
      hist.p_avg != null ? Math.round(hist.p_avg * 10) / 10 : null,
    avg_carbs_g_per_meal:
      hist.cb_avg != null ? Math.round(hist.cb_avg * 10) / 10 : null,
    avg_fat_g_per_meal:
      hist.f_avg != null ? Math.round(hist.f_avg * 10) / 10 : null,
    distinct_logging_days_last_7: streak.d,
    today_before_this_meal: today,
  };
}

function rowToExample(row: {
  meal_type: string;
  description: string;
  calories_est: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  tips: string | null;
  ai_raw: string | null;
  created_at: string;
}): FinetuneChatRow | null {
  if (
    row.calories_est == null ||
    row.protein_g == null ||
    row.carbs_g == null ||
    row.fat_g == null
  ) {
    return null;
  }
  let tips = row.tips ?? "";
  if (!tips && row.ai_raw) {
    try {
      const j = JSON.parse(row.ai_raw) as { tips?: string };
      tips = j.tips ?? "";
    } catch {
      /* ignore */
    }
  }
  const assistantObj = {
    calories_est: Math.round(row.calories_est),
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    tips: tips || "Log consistently to improve estimates over time.",
  };
  const personal = nutritionContextBeforeTimestamp(row.created_at);
  const userPayload = JSON.stringify({
    meal_type: row.meal_type,
    description: row.description.trim(),
    personalNutritionHistory: personal.logged_meals > 0 ? personal : null,
  });
  return {
    messages: [
      { role: "system", content: NUTRITION_MEAL_SYSTEM_PROMPT },
      { role: "user", content: userPayload },
      { role: "assistant", content: JSON.stringify(assistantObj) },
    ],
  };
}

export type ExportNutritionResult = {
  absolutePath: string;
  exampleCount: number;
  skippedIncomplete: number;
};

/** Writes OpenAI chat fine-tuning JSONL from `nutrition_logs` labels. */
export function exportNutritionFinetuneJsonl(): ExportNutritionResult {
  const outDir = path.join(__dirname, "..", "..", "data", "finetune");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const absolutePath = path.join(outDir, `nutrition-${stamp}.jsonl`);

  const rows = db
    .prepare(
      `SELECT meal_type, description, calories_est, protein_g, carbs_g, fat_g, tips, ai_raw, created_at
       FROM nutrition_logs
       ORDER BY datetime(created_at) ASC`
    )
    .all() as {
    meal_type: string;
    description: string;
    calories_est: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    tips: string | null;
    ai_raw: string | null;
    created_at: string;
  }[];

  let skipped = 0;
  const lines: string[] = [];
  for (const row of rows) {
    const ex = rowToExample(row);
    if (!ex) {
      skipped++;
      continue;
    }
    lines.push(JSON.stringify(ex));
  }

  fs.writeFileSync(absolutePath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  return {
    absolutePath,
    exampleCount: lines.length,
    skippedIncomplete: skipped,
  };
}

export function countNutritionFinetuneEligible(): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM nutrition_logs
       WHERE calories_est IS NOT NULL AND protein_g IS NOT NULL
         AND carbs_g IS NOT NULL AND fat_g IS NOT NULL`
    )
    .get() as { c: number };
  return row.c;
}
