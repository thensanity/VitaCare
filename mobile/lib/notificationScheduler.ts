import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Medication, ReminderPreferences } from "@/lib/api";
import { wellnessApi } from "@/lib/api";

const ANDROID_CHANNEL = "vitacare-reminders";

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "VitaCare reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

function daily(
  hour: number,
  minute: number
): Notifications.DailyTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    channelId: Platform.OS === "android" ? ANDROID_CHANNEL : undefined,
  };
}

/**
 * Replaces all scheduled local notifications from preferences + medications.
 */
export async function rescheduleAllNotifications(
  prefs: ReminderPreferences,
  medications: Medication[]
): Promise<void> {
  if (Platform.OS === "web") return;
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!prefs.masterEnabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const schedule = (
    identifier: string,
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput
  ) =>
    Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        ...(Platform.OS === "ios"
          ? {
              subtitle: "VitaCare",
              interruptionLevel: "active" as const,
            }
          : {}),
      },
      trigger,
    });

  if (prefs.checkIn.enabled) {
    await schedule(
      "vitacare-checkin",
      "Daily check-in",
      "Open Elderly Care and log how you're feeling today.",
      daily(prefs.checkIn.hour, prefs.checkIn.minute)
    );
  }

  if (prefs.vitals.enabled) {
    await schedule(
      "vitacare-vitals",
      "Vitals reminder",
      "Log heart rate, blood pressure, or oxygen if your care plan uses them.",
      daily(prefs.vitals.hour, prefs.vitals.minute)
    );
  }

  if (prefs.hydration.enabled) {
    const slots = [...new Set(prefs.hydration.slots)].sort((a, b) => a - b);
    let i = 0;
    for (const h of slots) {
      await schedule(
        `vitacare-hydr-${h}-${i++}`,
        "Hydration nudge",
        "Time for a glass of water—small sips count.",
        daily(h, 0)
      );
    }
  }

  if (prefs.lunchMeal.enabled) {
    await schedule(
      "vitacare-lunch",
      "Meal logging",
      "Log lunch in Nutrition to keep today's totals accurate.",
      daily(prefs.lunchMeal.hour, prefs.lunchMeal.minute)
    );
  }

  if (prefs.fitness.enabled) {
    await schedule(
      "vitacare-fitness",
      "Movement",
      "Short movement or a logged session in Fitness keeps plans on track.",
      daily(prefs.fitness.hour, prefs.fitness.minute)
    );
  }

  if (prefs.careReview.enabled) {
    await schedule(
      "vitacare-care-review",
      "Care review",
      "Check Elderly Care for alerts and caregiver notes.",
      daily(prefs.careReview.hour, prefs.careReview.minute)
    );
  }

  for (const med of medications) {
    if (!med.enabled) continue;
    let t = 0;
    for (const hm of med.schedule_times) {
      const [hh, mm] = hm.split(":").map((x) => Number(x));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      await schedule(
        `vitacare-med-${med.id}-${t++}`,
        `Medication · ${med.label}`,
        `Reminder: ${med.label}. Follow your clinician's instructions.`,
        daily(hh, mm)
      );
    }
  }
}

export async function syncNotificationScheduleFromServer(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const [prefs, meds] = await Promise.all([
      wellnessApi.getPreferences(),
      wellnessApi.listMedications(),
    ]);
    await rescheduleAllNotifications(prefs, meds);
  } catch {
    /* offline */
  }
}
