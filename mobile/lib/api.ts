import Constants from "expo-constants";
import { Platform } from "react-native";

function defaultApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const extra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (extra) return extra.replace(/\/$/, "");
  if (Platform.OS === "android") return "http://10.0.2.2:3001";
  return "http://127.0.0.1:3001";
}

export const API_BASE = defaultApiBase();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type CheckIn = {
  id: number;
  mood: number;
  mobility: string;
  sleep_quality: number | null;
  notes: string | null;
  created_at: string;
};

export type ElderlyInsight = {
  insight: string;
  earlyWarnings: string[];
  caregiverAlertSuggested: boolean;
  caregiverAlertReason: string;
  generatedAt: string;
};

export type VitalReading = {
  id: number;
  heart_rate_bpm: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  spo2_pct: number | null;
  temperature_c: number | null;
  source: string;
  notes: string | null;
  created_at: string;
};

export type ActivityLog = {
  id: number;
  steps: number | null;
  active_minutes: number | null;
  intensity: string;
  source: string;
  notes: string | null;
  created_at: string;
};

export type SleepLog = {
  id: number;
  hours_slept: number;
  sleep_quality: number;
  bedtime_consistency: string | null;
  notes: string | null;
  created_at: string;
};

export type Caregiver = {
  id: number;
  name: string;
  phone: string;
  relation: string | null;
  created_at: string;
};

export type CareAlert = {
  id: number;
  severity: string;
  title: string;
  detail: string;
  triggered_by: string;
  caregiver_notify_simulated: number;
  created_at: string;
};

export type NutritionLog = {
  id: number;
  meal_type: string;
  description: string;
  calories_est: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  tips: string | null;
  created_at: string;
};

export type TodaySummary = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: number;
};

export type FitnessPlan = {
  weekTheme: string;
  days: {
    day: string;
    focus: string;
    blocks: { name: string; durationMin: number; detail: string }[];
  }[];
};

export type FitnessCoach = {
  voiceScript: string;
  formCues: string[];
  adaptationNote: string;
};

export const elderlyApi = {
  listCheckIns: () => api<CheckIn[]>("/api/elderly/check-ins"),
  submitCheckIn: (body: {
    mood: number;
    mobility: string;
    sleep_quality?: number;
    notes?: string;
  }) =>
    api<{ id: number }>("/api/elderly/check-ins", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getInsight: () => api<ElderlyInsight>("/api/elderly/insight"),
  submitVitals: (body: Record<string, unknown>) =>
    api<{ id: number }>("/api/elderly/vitals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listVitals: () => api<VitalReading[]>("/api/elderly/vitals"),
  submitActivity: (body: Record<string, unknown>) =>
    api<{ id: number }>("/api/elderly/activity", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listActivity: () => api<ActivityLog[]>("/api/elderly/activity"),
  submitSleep: (body: Record<string, unknown>) =>
    api<{ id: number }>("/api/elderly/sleep-logs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSleep: () => api<SleepLog[]>("/api/elderly/sleep-logs"),
  addCaregiver: (body: {
    name: string;
    phone: string;
    relation?: string;
  }) =>
    api<{ id: number }>("/api/elderly/caregivers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listCaregivers: () => api<Caregiver[]>("/api/elderly/caregivers"),
  deleteCaregiver: (id: number) =>
    api<void>(`/api/elderly/caregivers/${id}`, { method: "DELETE" }),
  createAlert: (body: {
    severity: "info" | "watch" | "emergency";
    title: string;
    detail: string;
  }) =>
    api<{ id: number; caregiverNotifySimulated: boolean }>(
      "/api/elderly/alerts",
      { method: "POST", body: JSON.stringify(body) }
    ),
  listAlerts: () => api<CareAlert[]>("/api/elderly/alerts"),
};

export const nutritionApi = {
  todaySummary: () => api<TodaySummary>("/api/nutrition/summary/today"),
  listLogs: () => api<NutritionLog[]>("/api/nutrition/logs"),
  logMeal: (body: { meal_type: string; description: string }) =>
    api<{
      id: number;
      calories_est: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      tips: string;
    }>("/api/nutrition/logs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const fitnessApi = {
  getProfile: () =>
    api<{
      goals: string;
      level: string;
      preferences: string;
      recovery_notes: string;
      updated_at: string;
    }>("/api/fitness/profile"),
  putProfile: (body: Record<string, unknown>) =>
    api<{ ok: boolean }>("/api/fitness/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  generatePlan: (body?: Record<string, unknown>) =>
    api<{ id: number; plan: FitnessPlan; summary: string }>(
      "/api/fitness/plan",
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),
  getLatestPlan: () =>
    api<{
      id: number;
      plan: FitnessPlan;
      summary: string | null;
      createdAt: string;
    }>("/api/fitness/plan/latest"),
  logSession: (body: {
    workout_name: string;
    duration_minutes?: number;
    perceived_effort?: number;
    performance_notes?: string;
  }) =>
    api<{ id: number }>("/api/fitness/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSessions: () =>
    api<
      {
        id: number;
        workout_name: string;
        duration_minutes: number | null;
        perceived_effort: number | null;
        performance_notes: string | null;
        created_at: string;
      }[]
    >("/api/fitness/sessions"),
  coach: (body: { exerciseName: string; userNotes?: string }) =>
    api<FitnessCoach>("/api/fitness/coach", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export type ChatMsg = { role: "user" | "assistant"; content: string };

export const chatApi = {
  send: (messages: ChatMsg[]) =>
    api<{ reply: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  /** Native recording URI → OpenAI Whisper via backend. */
  transcribe: async (uri: string): Promise<string> => {
    const form = new FormData();
    const name = uri.split("/").pop() || "recording.m4a";
    const type = name.endsWith(".webm")
      ? "audio/webm"
      : name.endsWith(".wav")
        ? "audio/wav"
        : "audio/m4a";
    form.append(
      "audio",
      { uri, name, type } as unknown as Blob
    );
    const res = await fetch(`${API_BASE}/api/chat/transcribe`, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText);
    }
    const j = (await res.json()) as { text: string };
    return j.text;
  },
};

export const healthApi = {
  ping: () => api<{ ok: boolean }>("/health"),
};

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

export type Medication = {
  id: number;
  label: string;
  schedule_times: string[];
  enabled: boolean;
  created_at: string;
};

export type HydrationLog = {
  id: number;
  amount_ml: number;
  note: string | null;
  created_at: string;
};

export const wellnessApi = {
  getPreferences: () => api<ReminderPreferences>("/api/wellness/preferences"),
  putPreferences: (patch: Partial<ReminderPreferences>) =>
    api<ReminderPreferences>("/api/wellness/preferences", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  hydrationToday: () =>
    api<{ total_ml: number; logs: number }>("/api/wellness/hydration/today"),
  logHydration: (body?: { amount_ml?: number; note?: string }) =>
    api<{ id: number }>("/api/wellness/hydration", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  listHydrationRecent: (limit?: number) =>
    api<HydrationLog[]>(`/api/wellness/hydration/recent?limit=${limit ?? 14}`),
  listMedications: () => api<Medication[]>("/api/wellness/medications"),
  addMedication: (body: {
    label: string;
    schedule_times: string[];
    enabled?: boolean;
  }) =>
    api<{ id: number }>("/api/wellness/medications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteMedication: (id: number) =>
    api<void>(`/api/wellness/medications/${id}`, { method: "DELETE" }),
  setMedicationEnabled: (id: number, enabled: boolean) =>
    api<{ ok: boolean }>(`/api/wellness/medications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  summary: () =>
    api<{
      hydrationTodayMl: number;
      checkInDaysLast7: number;
      activeMedications: number;
    }>("/api/wellness/summary"),
};
