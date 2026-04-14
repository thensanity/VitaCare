import * as ExpoHealthKit from "@kayzmann/expo-healthkit";

import { elderlyApi } from "@/lib/api";

import type { WearableCapabilities, WearableSyncResult } from "./wearableHealth.types";

const READ: ExpoHealthKit.DataType[] = [
  "Steps",
  "HeartRate",
  "RestingHeartRate",
  "OxygenSaturation",
  "SleepAnalysis",
];

export function getWearableCapabilities(): WearableCapabilities {
  try {
    const ok = ExpoHealthKit.isAvailable();
    return {
      platform: "ios",
      healthKit: ok,
      hint: ok
        ? "Apple Watch data flows into Apple Health. Grant read access, then sync to send steps, heart rate, SpO₂, and sleep estimates to VitaCare."
        : "HealthKit is not available on this device (simulator or restricted build).",
    };
  } catch {
    return {
      platform: "ios",
      healthKit: false,
      hint:
        "Install a development build with the HealthKit config plugin (npx expo prebuild & run:ios). Expo Go does not include this native module.",
    };
  }
}

export async function requestHealthAuthorization(): Promise<boolean> {
  try {
    await ExpoHealthKit.requestAuthorization(READ, []);
    return true;
  } catch {
    return false;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function syncWearableToVitaCare(): Promise<WearableSyncResult> {
  const caps = getWearableCapabilities();
  if (!caps.healthKit) {
    return {
      ok: false,
      message: caps.hint,
      posted: { activity: false, vitals: false, sleep: false },
    };
  }

  const errors: string[] = [];
  let posted = { activity: false, vitals: false, sleep: false };

  try {
    const now = new Date();
    const steps = await ExpoHealthKit.getSteps(startOfToday(), now).catch(
      () => 0
    );

    if (steps > 0) {
      try {
        await elderlyApi.submitActivity({
          steps: Math.round(steps),
          source: "apple_health",
          notes:
            "Steps from Apple Health (includes Apple Watch and iPhone when sources contribute).",
        });
        posted.activity = true;
      } catch (e) {
        errors.push(
          e instanceof Error ? e.message : "Could not post activity."
        );
      }
    }

    let hr: number | null = null;
    let spo2: number | null = null;
    let resting: number | null = null;

    try {
      hr = await ExpoHealthKit.getLatestHeartRate();
    } catch {
      /* optional */
    }

    try {
      resting = await ExpoHealthKit.getRestingHeartRate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        now
      );
    } catch {
      /* optional */
    }

    try {
      const oxy = await ExpoHealthKit.getOxygenSaturation(
        new Date(Date.now() - 48 * 60 * 60 * 1000),
        now,
        5
      );
      if (oxy.length) {
        const latest = oxy.reduce((a, b) =>
          (b.endDate ?? 0) > (a.endDate ?? 0) ? b : a
        );
        const v = latest.value;
        spo2 = v <= 1 && v > 0 ? Math.round(v * 100) : Math.round(v);
      }
    } catch {
      /* optional */
    }

    const noteParts: string[] = ["Apple Health / Apple Watch sync."];
    if (resting != null) noteParts.push(`Resting HR ~${Math.round(resting)} bpm (Health).`);

    const hasVital = hr != null || spo2 != null || resting != null;

    if (hasVital) {
      try {
        await elderlyApi.submitVitals({
          heart_rate_bpm: hr != null ? Math.round(hr) : undefined,
          spo2_pct: spo2 != null ? Math.min(100, Math.max(70, spo2)) : undefined,
          source: "apple_health",
          notes: noteParts.join(" "),
        });
        posted.vitals = true;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Could not post vitals.");
      }
    }

    const sleepStart = new Date(Date.now() - 36 * 60 * 60 * 1000);
    try {
      const samples = await ExpoHealthKit.getSleepSamples(sleepStart, now);
      const asleepSec = samples
        .filter((s) =>
          ["asleep", "core", "deep", "rem"].includes(s.value)
        )
        .reduce((sum, s) => sum + (s.duration || 0), 0);
      const hours = asleepSec / 3600;
      if (hours >= 2 && hours <= 14) {
        try {
          await elderlyApi.submitSleep({
            hours_slept: Math.round(hours * 10) / 10,
            sleep_quality: 3,
            bedtime_consistency: "unknown",
            notes:
              "Sleep duration estimated from Apple Health (sources may include Apple Watch).",
          });
          posted.sleep = true;
        } catch (e) {
          errors.push(
            e instanceof Error ? e.message : "Could not post sleep log."
          );
        }
      }
    } catch {
      /* sleep optional */
    }

    const any = posted.activity || posted.vitals || posted.sleep;
    const summary = [
      posted.activity ? "Activity" : null,
      posted.vitals ? "Vitals" : null,
      posted.sleep ? "Sleep" : null,
    ]
      .filter(Boolean)
      .join(", ");
    let message = any
      ? `${summary} updated in VitaCare.`
      : "No new data to sync. Allow VitaCare in Health ▸ Sharing; ensure Apple Watch writes Steps and Heart Rate to Health.";
    if (errors.length) message = `${errors.join(" ")} ${message}`;
    return {
      ok: any && errors.length === 0,
      message,
      posted,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "Sync failed. Confirm Health access in Settings ▸ Privacy ▸ Health.",
      posted,
    };
  }
}
