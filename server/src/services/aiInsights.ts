import OpenAI from "openai";

import { ELDERLY_MONITOR_SYSTEM_PROMPT } from "../prompts/elderlyMonitoring.js";
import {
  FITNESS_COACH_SYSTEM_PROMPT,
  FITNESS_PLAN_SYSTEM_PROMPT,
} from "../prompts/fitness.js";
import { NUTRITION_MEAL_SYSTEM_PROMPT } from "../prompts/nutritionMeal.js";
import {
  getOpenAIChatModel,
  getOpenAIMealModel,
  hasOpenAIKey,
} from "./openaiConfig.js";
import type {
  ElderlyPersonalBaselines,
  FitnessSessionAggregate,
  NutritionPersonalContext,
} from "./personalContext.js";
import {
  deriveElderlySignals,
  type ElderlyDerivedSignals,
} from "./wellnessDerivation.js";

export type ElderlyInsightInput = {
  recentCheckIns: {
    mood: number;
    mobility: string;
    sleep_quality: number | null;
    notes: string | null;
    created_at: string;
  }[];
};

export type ElderlyMonitoringInput = ElderlyInsightInput & {
  personalBaselines?: ElderlyPersonalBaselines;
  recentVitals: {
    heart_rate_bpm: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    spo2_pct: number | null;
    temperature_c: number | null;
    notes: string | null;
    created_at: string;
  }[];
  recentActivity: {
    steps: number | null;
    active_minutes: number | null;
    intensity: string;
    notes: string | null;
    created_at: string;
  }[];
  recentSleep: {
    hours_slept: number;
    sleep_quality: number;
    bedtime_consistency: string | null;
    notes: string | null;
    created_at: string;
  }[];
};

export type ElderlyMonitoringResult = {
  insight: string;
  earlyWarnings: string[];
  caregiverAlertSuggested: boolean;
  caregiverAlertReason: string;
};

export type MealAnalysis = {
  calories_est: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  tips: string;
};

export type FitnessPlanJson = {
  weekTheme: string;
  days: {
    day: string;
    focus: string;
    blocks: { name: string; durationMin: number; detail: string }[];
  }[];
};

export type FitnessCoachResult = {
  voiceScript: string;
  formCues: string[];
  adaptationNote: string;
};

function heuristicEarlyWarnings(
  input: ElderlyMonitoringInput,
  derived: ElderlyDerivedSignals = deriveElderlySignals(
    input,
    input.personalBaselines
  )
): string[] {
  const w: string[] = [];
  const lastV = input.recentVitals[0];

  if (derived.note_flags.includes("crisis_mental_health_language")) {
    w.push(
      "Written notes suggest a possible mental-health crisis—contact local emergency services or a crisis line now; chat is not a substitute for immediate help."
    );
  }
  if (derived.note_flags.includes("possible_cardiac_symptom_language")) {
    w.push(
      "Chest discomfort is mentioned in notes—treat as urgent until a clinician evaluates, especially with shortness of breath or sweating."
    );
  }
  if (derived.note_flags.includes("possible_fall_or_balance")) {
    w.push(
      "A fall, slip, or balance problem is noted—check for injury and consider a fall-risk review with a clinician."
    );
  }
  if (derived.note_flags.includes("respiratory_distress_language")) {
    w.push(
      "Breathing trouble is noted in text—if symptoms are ongoing or worsening, seek urgent medical care."
    );
  }
  if (derived.note_flags.includes("possible_confusion_language")) {
    w.push(
      "New or worsening confusion is noted—this needs prompt medical assessment."
    );
  }
  if (derived.note_flags.includes("dizziness_or_syncope_language")) {
    w.push(
      "Dizziness or fainting is noted—avoid driving until evaluated if this is new or severe."
    );
  }
  if (derived.note_flags.includes("reduced_intake_language")) {
    w.push(
      "Poor appetite or food refusal is noted—watch hydration and involve a clinician if it continues."
    );
  }

  if (lastV?.heart_rate_bpm != null) {
    if (lastV.heart_rate_bpm > 100)
      w.push("Recent resting heart rate looks high vs typical—worth a clinician check if persistent.");
    if (lastV.heart_rate_bpm < 50)
      w.push("Very low heart rate reading logged—confirm device placement or seek advice if unwell.");
  }
  if (derived.hr_vs_personal_avg_bpm != null) {
    if (derived.hr_vs_personal_avg_bpm >= 25)
      w.push("Heart rate is well above this person's usual—repeat the reading and consider clinical input if it persists with symptoms.");
    if (derived.hr_vs_personal_avg_bpm <= -25)
      w.push("Heart rate is well below this person's usual—recheck the device and symptoms.");
  }

  if (lastV?.spo2_pct != null) {
    if (lastV.spo2_pct < 90) {
      w.push("SpO₂ is critically low on paper—seek urgent care if accurate; nails, motion, and cold hands skew readings.");
    } else if (lastV.spo2_pct < 92) {
      w.push("SpO₂ reading is concerning on paper—this app is not a medical device; seek urgent care if symptomatic.");
    } else if (lastV.spo2_pct <= 93) {
      w.push("Borderline oxygen saturation—repeat per oximeter instructions; contact a clinician if breathless or dropping.");
    }
  }
  if (derived.spo2_vs_personal_avg != null && derived.spo2_vs_personal_avg <= -4) {
    w.push("Oxygen level has fallen compared with this person's recent baseline—repeat the measurement and escalate if unwell.");
  }

  if (lastV?.temperature_c != null && lastV.temperature_c >= 38) {
    w.push("Fever-range temperature logged—follow your care plan; seek advice sooner if frail, confused, or short of breath.");
  }

  if (lastV?.bp_systolic != null && lastV.bp_diastolic != null) {
    if (lastV.bp_systolic >= 180 || lastV.bp_diastolic >= 110) {
      w.push("Blood pressure is severely elevated on paper—follow clinician rules for emergencies; seek care if symptoms.");
    } else if (lastV.bp_systolic >= 160 || lastV.bp_diastolic >= 100) {
      w.push("Blood pressure entry is markedly elevated; follow your care plan and contact your clinician.");
    }
  }

  const moods = input.recentCheckIns.map((c) => c.mood);
  if (moods.length >= 2 && moods[0] <= 2 && moods[1] <= 2) {
    w.push("Mood has been low on consecutive check-ins—consider reaching out to family or a clinician.");
  }
  if (derived.mood_trend === "declining" && (derived.mood_recent_avg ?? 4) <= 2.5) {
    w.push("Mood appears to be trending down versus prior check-ins—extra social contact or professional support may help.");
  }

  const steps = input.recentActivity
    .slice(0, 5)
    .map((a) => a.steps ?? 0);
  if (steps.length >= 3 && steps.every((s) => s < 1500)) {
    w.push("Activity (steps) has been very low for several entries—gentle pacing and a provider review may help.");
  }
  const sleepQs = input.recentSleep.slice(0, 4).map((s) => s.sleep_quality);
  if (sleepQs.length >= 3 && sleepQs.every((q) => q <= 2)) {
    w.push("Sleep quality ratings are persistently poor—review evening routines and discuss with your clinician.");
  }
  if (derived.recent_sleep_hours_low) {
    w.push("Several recent nights show very short sleep—daytime safety (focus, falls) matters; discuss with a clinician if ongoing.");
  }

  const hours = input.recentSleep.slice(0, 3).map((s) => s.hours_slept);
  if (hours.length >= 2 && hours.every((h) => h < 4.5)) {
    w.push("Logged sleep duration is very low across recent nights—rule out pain, medications, or apnea with a clinician.");
  }

  return w;
}

function forceCaregiverAlert(
  input: ElderlyMonitoringInput,
  derived: ElderlyDerivedSignals = deriveElderlySignals(
    input,
    input.personalBaselines
  )
): boolean {
  const lastV = input.recentVitals[0];
  const criticalFlags = new Set([
    "crisis_mental_health_language",
    "possible_cardiac_symptom_language",
    "possible_fall_or_balance",
    "possible_confusion_language",
  ]);
  if (derived.note_flags.some((f) => criticalFlags.has(f))) return true;
  if (lastV?.spo2_pct != null && lastV.spo2_pct < 93) return true;
  if (lastV?.temperature_c != null && lastV.temperature_c >= 38) return true;
  if (
    lastV?.bp_systolic != null &&
    lastV.bp_diastolic != null &&
    (lastV.bp_systolic >= 180 || lastV.bp_diastolic >= 110)
  )
    return true;
  return false;
}

function mockElderlyMonitoring(input: ElderlyMonitoringInput): ElderlyMonitoringResult {
  const derived = deriveElderlySignals(input, input.personalBaselines);
  const warnings = heuristicEarlyWarnings(input, derived);
  const moodAvg =
    input.recentCheckIns.length === 0
      ? 3
      : input.recentCheckIns.reduce((a, c) => a + c.mood, 0) /
        input.recentCheckIns.length;
  const lines: string[] = [];
  if (
    input.recentVitals.length === 0 &&
    input.recentActivity.length === 0 &&
    input.recentSleep.length === 0 &&
    input.recentCheckIns.length === 0
  ) {
    lines.push(
      "Start logging vitals, activity, sleep, and daily check-ins so VitaCare can watch for early pattern changes."
    );
  } else {
    lines.push(
      "Patterns combine mood, movement, sleep, and any home vitals—use them for early awareness, not diagnosis."
    );
    if (derived.logging_density === "sparse") {
      lines.push(
        "Logging has been light, so trends are tentative—try a short daily routine (check-in + one vital or step count)."
      );
    }
    if (derived.mood_trend !== "unknown") {
      lines.push(
        `Mood trend vs prior check-ins: ${derived.mood_trend.replace("_", " ")}.`
      );
    }
    if (moodAvg < 2.5) {
      lines.push(
        "Mood average is soft: schedule a friendly check-in and keep hydration and daylight exposure steady."
      );
    }
    if (input.recentSleep[0]) {
      lines.push(
        `Latest sleep log: ${input.recentSleep[0].hours_slept}h at quality ${input.recentSleep[0].sleep_quality}/5—keep wake times consistent.`
      );
    }
    if (input.recentActivity[0]?.steps != null) {
      lines.push(
        `Recent step count: ${input.recentActivity[0].steps}. Short, frequent movement beats rare long bursts for many adults.`
      );
    }
  }
  const alert =
    forceCaregiverAlert(input, derived) ||
    warnings.length > 0 ||
    (input.recentVitals[0]?.spo2_pct != null &&
      input.recentVitals[0].spo2_pct < 93);
  lines.push(
    "Configure OPENAI_API_KEY and OPENAI_CHAT_MODEL on the server to use a live OpenAI model; caregiver alerts stay simulated in-app."
  );
  return {
    insight: lines.join(" "),
    earlyWarnings: warnings,
    caregiverAlertSuggested: alert,
    caregiverAlertReason:
      warnings[0] ??
      (alert ? "Threshold-based watch based on latest readings or notes." : ""),
  };
}

export async function generateElderlyMonitoringInsight(
  input: ElderlyMonitoringInput
): Promise<ElderlyMonitoringResult> {
  if (!hasOpenAIKey()) return mockElderlyMonitoring(input);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = getOpenAIChatModel();
  const derivedSignals = deriveElderlySignals(
    input,
    input.personalBaselines
  );
  const payload = JSON.stringify({
    checkIns: input.recentCheckIns.slice(0, 14),
    vitals: input.recentVitals.slice(0, 20),
    activity: input.recentActivity.slice(0, 14),
    sleep: input.recentSleep.slice(0, 14),
    personalBaselines: input.personalBaselines ?? null,
    derivedSignals,
  });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: ELDERLY_MONITOR_SYSTEM_PROMPT,
      },
      { role: "user", content: payload },
    ],
    max_tokens: 500,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return mockElderlyMonitoring(input);
  try {
    const parsed = JSON.parse(raw) as ElderlyMonitoringResult;
    if (typeof parsed.insight === "string") {
      const heur = heuristicEarlyWarnings(input, derivedSignals);
      const modelWarnings = Array.isArray(parsed.earlyWarnings)
        ? parsed.earlyWarnings.map(String)
        : [];
      const earlyWarnings = [...new Set([...heur, ...modelWarnings])];
      const caregiverAlertSuggested =
        !!parsed.caregiverAlertSuggested ||
        heur.length > 0 ||
        forceCaregiverAlert(input, derivedSignals);
      const caregiverAlertReason =
        String(parsed.caregiverAlertReason ?? "").trim() ||
        heur[0] ||
        "";
      return {
        insight: parsed.insight,
        earlyWarnings,
        caregiverAlertSuggested,
        caregiverAlertReason,
      };
    }
  } catch {
    /* fall through */
  }
  return mockElderlyMonitoring(input);
}

/** @deprecated Use generateElderlyMonitoringInsight with full context. */
export async function generateElderlyInsight(
  input: ElderlyInsightInput
): Promise<string> {
  const r = await generateElderlyMonitoringInsight({
    ...input,
    recentVitals: [],
    recentActivity: [],
    recentSleep: [],
  });
  return r.insight;
}

function mockMealAnalysis(description: string, mealType: string): MealAnalysis {
  const len = Math.min(60, description.length);
  const base = 320 + len * 4;
  const mt = mealType.toLowerCase();
  let tips =
    "Aim for colorful produce and a palm-sized protein portion. Log consistently so trends are easier to read.";
  if (mt.includes("break")) {
    tips =
      "Breakfast: pair protein (egg, yogurt, tofu) with fiber (fruit, oats, whole grain) so energy lasts until lunch.";
  } else if (mt.includes("lunch")) {
    tips =
      "Lunch: half-plate vegetables when you can, plus protein—helps avoid the mid-afternoon slump.";
  } else if (mt.includes("dinner") || mt.includes("evening")) {
    tips =
      "Dinner: lighter refined carbs if sleep is sensitive; extra vegetables and lean protein often sit well.";
  } else if (mt.includes("snack")) {
    tips =
      "Snack: combine protein + produce or whole food (fruit + nuts, hummus + veg) to avoid a sugar-only spike.";
  }
  return {
    calories_est: Math.round(base + (description.length % 7) * 15),
    protein_g: Math.round((18 + (description.length % 5)) * 10) / 10,
    carbs_g: Math.round((35 + (description.length % 8)) * 10) / 10,
    fat_g: Math.round((12 + (description.length % 4)) * 10) / 10,
    tips,
  };
}

export async function analyzeMealDescription(
  description: string,
  mealType: string,
  nutritionPersonal?: NutritionPersonalContext
): Promise<MealAnalysis> {
  if (!hasOpenAIKey()) return mockMealAnalysis(description, mealType);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = getOpenAIMealModel();
  const userPayload = JSON.stringify({
    meal_type: mealType,
    description,
    personalNutritionHistory: nutritionPersonal ?? null,
  });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: NUTRITION_MEAL_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPayload,
      },
    ],
    max_tokens: 280,
    temperature: 0.25,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return mockMealAnalysis(description, mealType);
  try {
    const parsed = JSON.parse(raw) as MealAnalysis;
    if (
      typeof parsed.calories_est === "number" &&
      typeof parsed.protein_g === "number"
    ) {
      return {
        calories_est: Math.round(parsed.calories_est),
        protein_g: parsed.protein_g,
        carbs_g: parsed.carbs_g,
        fat_g: parsed.fat_g,
        tips: parsed.tips || mockMealAnalysis(description, mealType).tips,
      };
    }
  } catch {
    /* fall through */
  }
  return mockMealAnalysis(description, mealType);
}

function mockFitnessPlan(profile: {
  goals: string;
  level: string;
  preferences: string;
  recovery_notes: string;
}): FitnessPlanJson {
  const focus =
    profile.goals.trim() || "General conditioning, mobility, and strength";
  return {
    weekTheme: `Progressive week: ${focus} (${profile.level})`,
    days: [
      {
        day: "Mon",
        focus: "Lower body + core stability",
        blocks: [
          {
            name: "Warm-up walk or bike",
            durationMin: 8,
            detail: "Easy effort; breathe through the nose when possible.",
          },
          {
            name: "Sit-to-stand or box squat",
            durationMin: 12,
            detail: "3 sets of 8; controlled tempo; use a sturdy chair.",
          },
          {
            name: "Dead bug or bird dog",
            durationMin: 10,
            detail: "Slow reps; keep ribs stacked; stop if sharp pain.",
          },
        ],
      },
      {
        day: "Wed",
        focus: "Upper push + posture",
        blocks: [
          {
            name: "Shoulder CARs or arm circles",
            durationMin: 6,
            detail: "Pain-free range only.",
          },
          {
            name: "Incline push-up or dumbbell press",
            durationMin: 15,
            detail: "3 sets of 8–12; 2 RIR (reps in reserve).",
          },
          {
            name: "Band pull-apart",
            durationMin: 8,
            detail: "3 sets of 15; squeeze shoulder blades.",
          },
        ],
      },
      {
        day: "Fri",
        focus: "Intervals + recovery walk",
        blocks: [
          {
            name: "Brisk / easy intervals",
            durationMin: 18,
            detail: "6 x 1 min brisk, 1 min easy—adjust to fitness.",
          },
          {
            name: "Cooldown + breathing",
            durationMin: 8,
            detail: "Nasal breathing; light stretch preferences: " +
              (profile.preferences || "hips, thoracic spine"),
          },
        ],
      },
    ],
  };
}

export async function generateFitnessPlan(
  profile: {
    goals: string;
    level: string;
    preferences: string;
    recovery_notes: string;
  },
  sessionAggregate?: FitnessSessionAggregate
): Promise<FitnessPlanJson> {
  if (!hasOpenAIKey()) return mockFitnessPlan(profile);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = getOpenAIChatModel();
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: FITNESS_PLAN_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({
          profile,
          recentTrainingSummary: sessionAggregate ?? null,
        }),
      },
    ],
    max_tokens: 1400,
    temperature: 0.4,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return mockFitnessPlan(profile);
  try {
    const parsed = JSON.parse(raw) as FitnessPlanJson;
    if (parsed.weekTheme && Array.isArray(parsed.days)) return parsed;
  } catch {
    /* fall through */
  }
  return mockFitnessPlan(profile);
}

function mockFitnessCoach(
  exerciseName: string,
  profileLevel: string
): FitnessCoachResult {
  return {
    voiceScript: `Set up for ${exerciseName}. Brace gently, move smoothly, and stop if anything feels sharp. Two more quality reps beat five messy ones. You're training at ${profileLevel} intensity—leave two reps in the tank.`,
    formCues: [
      "Ribs down, neck long.",
      "Knees track over toes; no collapsing inward.",
      "Exhale on the harder phase of each rep.",
    ],
    adaptationNote:
      "If balance wavers, shorten range or hold a counter for support. Add five minutes of easy walking tomorrow if today felt heavy.",
  };
}

export async function generateFitnessCoach(
  exerciseName: string,
  userNotes: string,
  profileLevel: string,
  recentSessionsSummary: string
): Promise<FitnessCoachResult> {
  if (!hasOpenAIKey()) return mockFitnessCoach(exerciseName, profileLevel);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const model = getOpenAIChatModel();
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: FITNESS_COACH_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({
          exerciseName,
          userNotes,
          profileLevel,
          recentSessionsSummary,
        }),
      },
    ],
    max_tokens: 400,
    temperature: 0.45,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return mockFitnessCoach(exerciseName, profileLevel);
  try {
    const parsed = JSON.parse(raw) as FitnessCoachResult;
    if (typeof parsed.voiceScript === "string") {
      return {
        voiceScript: parsed.voiceScript,
        formCues: Array.isArray(parsed.formCues)
          ? parsed.formCues.map(String)
          : mockFitnessCoach(exerciseName, profileLevel).formCues,
        adaptationNote:
          String(parsed.adaptationNote) ||
          mockFitnessCoach(exerciseName, profileLevel).adaptationNote,
      };
    }
  } catch {
    /* fall through */
  }
  return mockFitnessCoach(exerciseName, profileLevel);
}
