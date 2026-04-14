import type { ElderlyPersonalBaselines } from "./personalContext.js";

/** Minimal shape for derivation (avoids circular import with aiInsights). */
export type ElderlyInputForDerivation = {
  recentCheckIns: {
    mood: number;
    notes: string | null;
  }[];
  recentVitals: {
    heart_rate_bpm: number | null;
    spo2_pct: number | null;
    notes: string | null;
  }[];
  recentActivity: { notes: string | null }[];
  recentSleep: { hours_slept: number; notes: string | null }[];
};

export type ElderlyDerivedSignals = {
  hr_vs_personal_avg_bpm: number | null;
  spo2_vs_personal_avg: number | null;
  mood_recent_avg: number | null;
  mood_older_avg: number | null;
  mood_trend: "improving" | "declining" | "stable" | "unknown";
  recent_sleep_hours_low: boolean;
  note_flags: string[];
  logging_density: "sparse" | "moderate" | "good";
};

const NOTE_TOPICS: [RegExp, string][] = [
  [/fall|fell|slipped|slip\s+and/i, "possible_fall_or_balance"],
  [
    /chest\s*(pain|tight|pressure)|squeezing|chest\s*discomfort/i,
    "possible_cardiac_symptom_language",
  ],
  [/dizzy|vertigo|lightheaded|faint/i, "dizziness_or_syncope_language"],
  [/confus|disorient|delirium|unrecogniz/i, "possible_confusion_language"],
  [
    /short(ness)?\s*of\s*breath|sob|can'?t\s*catch\s*(my\s*)?breath|wheez/i,
    "respiratory_distress_language",
  ],
  [
    /suicid|hurt\s*myself|end\s*it\s*all|no\s*reason\s*to\s*live/i,
    "crisis_mental_health_language",
  ],
  [/won'?t\s*eat|not\s*eating|refus(es|ing)\s*food/i, "reduced_intake_language"],
];

function collectNoteText(input: ElderlyInputForDerivation): string {
  const parts: string[] = [];
  for (const c of input.recentCheckIns.slice(0, 7)) {
    if (c.notes) parts.push(c.notes);
  }
  for (const v of input.recentVitals.slice(0, 5)) {
    if (v.notes) parts.push(v.notes);
  }
  for (const a of input.recentActivity.slice(0, 5)) {
    if (a.notes) parts.push(a.notes);
  }
  for (const s of input.recentSleep.slice(0, 5)) {
    if (s.notes) parts.push(s.notes);
  }
  return parts.join("\n");
}

/** Structured features so the model can reason beyond raw rows. */
export function deriveElderlySignals(
  input: ElderlyInputForDerivation,
  baselines?: ElderlyPersonalBaselines
): ElderlyDerivedSignals {
  let hrVs: number | null = null;
  const lastHr = input.recentVitals[0]?.heart_rate_bpm;
  const avgHr = baselines?.vitals.avg_resting_hr;
  if (
    lastHr != null &&
    avgHr != null &&
    (baselines?.vitals.hr_samples ?? 0) >= 3
  ) {
    hrVs = Math.round(lastHr - avgHr);
  }

  let spo2Vs: number | null = null;
  const lastOx = input.recentVitals[0]?.spo2_pct;
  const avgOx = baselines?.vitals.avg_spo2;
  if (
    lastOx != null &&
    avgOx != null &&
    (baselines?.vitals.spo2_samples ?? 0) >= 3
  ) {
    spo2Vs = Math.round((lastOx - avgOx) * 10) / 10;
  }

  const ci = input.recentCheckIns;
  const recent = ci.slice(0, 3);
  const older = ci.slice(3, 6);
  const avg = (rows: typeof recent) =>
    rows.length === 0
      ? null
      : rows.reduce((a, x) => a + x.mood, 0) / rows.length;
  const ra = avg(recent);
  const oa = avg(older);
  let mood_trend: ElderlyDerivedSignals["mood_trend"] = "unknown";
  if (ra != null && oa != null) {
    if (ra - oa >= 0.5) mood_trend = "improving";
    else if (oa - ra >= 0.5) mood_trend = "declining";
    else mood_trend = "stable";
  }

  const recentSleep = input.recentSleep.slice(0, 3);
  const recent_sleep_hours_low =
    recentSleep.length >= 2 &&
    recentSleep.every((s) => s.hours_slept < 5.5);

  const blob = collectNoteText(input);
  const note_flags: string[] = [];
  for (const [re, label] of NOTE_TOPICS) {
    if (re.test(blob)) note_flags.push(label);
  }

  const totalSamples =
    (baselines?.check_ins.samples ?? 0) +
    (baselines?.vitals.hr_samples ?? 0) +
    (baselines?.activity.samples ?? 0) +
    (baselines?.sleep.samples ?? 0);
  let logging_density: ElderlyDerivedSignals["logging_density"] = "sparse";
  if (totalSamples >= 25) logging_density = "good";
  else if (totalSamples >= 8) logging_density = "moderate";

  return {
    hr_vs_personal_avg_bpm: hrVs,
    spo2_vs_personal_avg: spo2Vs,
    mood_recent_avg: ra != null ? Math.round(ra * 10) / 10 : null,
    mood_older_avg: oa != null ? Math.round(oa * 10) / 10 : null,
    mood_trend,
    recent_sleep_hours_low,
    note_flags,
    logging_density,
  };
}
