import { db } from "../db.js";

export type ElderlyPersonalBaselines = {
  windowDays: number;
  check_ins: {
    samples: number;
    avg_mood: number | null;
    latest_mood: number | null;
  };
  vitals: {
    hr_samples: number;
    avg_resting_hr: number | null;
    latest_hr: number | null;
    spo2_samples: number;
    avg_spo2: number | null;
    latest_spo2: number | null;
    bp_samples: number;
    avg_bp_sys: number | null;
    avg_bp_dia: number | null;
  };
  activity: {
    samples: number;
    avg_steps: number | null;
    latest_steps: number | null;
  };
  sleep: {
    samples: number;
    avg_hours: number | null;
    avg_quality: number | null;
  };
};

/** Rolling stats from the user's own logs — used to ground LLM outputs (not fine-tuning). */
export function buildElderlyPersonalBaselines(
  windowDays = 21
): ElderlyPersonalBaselines {
  const win = `-${windowDays} days`;
  const ci = db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(mood) AS avg_m,
              (SELECT mood FROM check_ins ORDER BY datetime(created_at) DESC LIMIT 1) AS last_m
       FROM check_ins
       WHERE datetime(created_at) > datetime('now', ?)`
    )
    .get(win) as {
    n: number;
    avg_m: number | null;
    last_m: number | null;
  };

  const vt = db
    .prepare(
      `SELECT
         SUM(CASE WHEN heart_rate_bpm IS NOT NULL THEN 1 ELSE 0 END) AS hr_n,
         AVG(heart_rate_bpm) AS hr_avg,
         (SELECT heart_rate_bpm FROM vital_readings WHERE heart_rate_bpm IS NOT NULL
          ORDER BY datetime(created_at) DESC LIMIT 1) AS hr_last,
         SUM(CASE WHEN spo2_pct IS NOT NULL THEN 1 ELSE 0 END) AS ox_n,
         AVG(spo2_pct) AS ox_avg,
         (SELECT spo2_pct FROM vital_readings WHERE spo2_pct IS NOT NULL
          ORDER BY datetime(created_at) DESC LIMIT 1) AS ox_last,
         SUM(CASE WHEN bp_systolic IS NOT NULL AND bp_diastolic IS NOT NULL THEN 1 ELSE 0 END) AS bp_n,
         AVG(bp_systolic) AS bp_s_avg,
         AVG(bp_diastolic) AS bp_d_avg
       FROM vital_readings
       WHERE datetime(created_at) > datetime('now', ?)`
    )
    .get(win) as {
    hr_n: number;
    hr_avg: number | null;
    hr_last: number | null;
    ox_n: number;
    ox_avg: number | null;
    ox_last: number | null;
    bp_n: number;
    bp_s_avg: number | null;
    bp_d_avg: number | null;
  };

  const act = db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(steps) AS avg_s,
              (SELECT steps FROM activity_logs WHERE steps IS NOT NULL
               ORDER BY datetime(created_at) DESC LIMIT 1) AS last_s
       FROM activity_logs
       WHERE datetime(created_at) > datetime('now', ?)`
    )
    .get(win) as { n: number; avg_s: number | null; last_s: number | null };

  const sl = db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(hours_slept) AS avg_h,
              AVG(sleep_quality) AS avg_q
       FROM sleep_logs
       WHERE datetime(created_at) > datetime('now', ?)`
    )
    .get(win) as { n: number; avg_h: number | null; avg_q: number | null };

  return {
    windowDays,
    check_ins: {
      samples: ci.n,
      avg_mood: ci.avg_m != null ? Math.round(ci.avg_m * 10) / 10 : null,
      latest_mood: ci.last_m,
    },
    vitals: {
      hr_samples: vt.hr_n,
      avg_resting_hr:
        vt.hr_avg != null ? Math.round(vt.hr_avg * 10) / 10 : null,
      latest_hr: vt.hr_last,
      spo2_samples: vt.ox_n,
      avg_spo2: vt.ox_avg != null ? Math.round(vt.ox_avg * 10) / 10 : null,
      latest_spo2: vt.ox_last,
      bp_samples: vt.bp_n,
      avg_bp_sys: vt.bp_s_avg != null ? Math.round(vt.bp_s_avg) : null,
      avg_bp_dia: vt.bp_d_avg != null ? Math.round(vt.bp_d_avg) : null,
    },
    activity: {
      samples: act.n,
      avg_steps: act.avg_s != null ? Math.round(act.avg_s) : null,
      latest_steps: act.last_s,
    },
    sleep: {
      samples: sl.n,
      avg_hours: sl.avg_h != null ? Math.round(sl.avg_h * 10) / 10 : null,
      avg_quality:
        sl.avg_q != null ? Math.round(sl.avg_q * 10) / 10 : null,
    },
  };
}

export type NutritionPersonalContext = {
  windowDays: number;
  logged_meals: number;
  avg_calories_per_meal: number | null;
  min_calories_per_meal_21d: number | null;
  max_calories_per_meal_21d: number | null;
  avg_protein_g_per_meal: number | null;
  avg_carbs_g_per_meal: number | null;
  avg_fat_g_per_meal: number | null;
  /** Days in the last 7 (calendar) with at least one log — measures habit consistency. */
  distinct_logging_days_last_7: number;
  today_before_this_meal: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    meals: number;
  };
};

export function buildNutritionPersonalContext(): NutritionPersonalContext {
  const w = 21;
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
       WHERE datetime(created_at) > datetime('now', '-21 days', 'localtime')`
    )
    .get() as {
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
       WHERE date(created_at) >= date('now', '-6 days', 'localtime')`
    )
    .get() as { d: number };

  const today = db
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

  return {
    windowDays: w,
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

export type FitnessSessionAggregate = {
  windowDays: number;
  sessions: number;
  avg_effort: number | null;
  avg_duration_min: number | null;
  recent_workouts: { name: string; effort: number | null; date: string }[];
};

export function buildFitnessSessionAggregate(
  windowDays = 14
): FitnessSessionAggregate {
  const win = `-${windowDays} days`;
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(perceived_effort) AS e_avg,
              AVG(duration_minutes) AS d_avg
       FROM fitness_sessions
       WHERE datetime(created_at) > datetime('now', ?)`
    )
    .get(win) as {
    n: number;
    e_avg: number | null;
    d_avg: number | null;
  };

  const recent = db
    .prepare(
      `SELECT workout_name, perceived_effort, created_at
       FROM fitness_sessions
       ORDER BY datetime(created_at) DESC
       LIMIT 6`
    )
    .all() as { workout_name: string; perceived_effort: number | null; created_at: string }[];

  return {
    windowDays,
    sessions: agg.n,
    avg_effort: agg.e_avg != null ? Math.round(agg.e_avg * 10) / 10 : null,
    avg_duration_min:
      agg.d_avg != null ? Math.round(agg.d_avg * 10) / 10 : null,
    recent_workouts: recent.map((r) => ({
      name: r.workout_name,
      effort: r.perceived_effort,
      date: r.created_at,
    })),
  };
}
