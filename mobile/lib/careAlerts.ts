import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { elderlyApi, wellnessApi } from "@/lib/api";

const STORAGE_KEY = "vitacare_last_seen_alert_id";

/**
 * When new care alerts appear (watch/emergency), show an immediate local notification.
 * Initializes last-seen on first run so old alerts don't spam.
 */
export async function notifyIfNewCareAlert(): Promise<void> {
  if (Platform.OS === "web") return;

  let allowPush = true;
  try {
    const prefs = await wellnessApi.getPreferences();
    allowPush = prefs.notifyNewCareAlerts;
  } catch {
    /* default allow */
  }
  if (!allowPush) return;

  const alerts = await elderlyApi.listAlerts().catch(() => []);
  if (!alerts.length) return;

  const latest = alerts[0];
  const prev = await AsyncStorage.getItem(STORAGE_KEY);
  if (prev == null) {
    await AsyncStorage.setItem(STORAGE_KEY, String(latest.id));
    return;
  }
  const prevId = Number(prev);
  if (!Number.isFinite(prevId) || latest.id <= prevId) return;

  await AsyncStorage.setItem(STORAGE_KEY, String(latest.id));

  if (latest.severity !== "watch" && latest.severity !== "emergency") return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const body =
    latest.detail.length > 200
      ? `${latest.detail.slice(0, 197)}…`
      : latest.detail;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: latest.title,
      subtitle: "VitaCare alert",
      body,
      ...(Platform.OS === "ios"
        ? { interruptionLevel: "timeSensitive" as const }
        : {}),
    },
    trigger: null,
  });
}
