import { Platform } from "react-native";

import type { WearableCapabilities, WearableSyncResult } from "./wearableHealth.types";

/**
 * Android / web: no HealthKit. Use manual logging; Health Connect integration can be added later.
 */
export function getWearableCapabilities(): WearableCapabilities {
  if (Platform.OS === "android") {
    return {
      platform: "android",
      healthKit: false,
      hint:
        "Wear OS and other trackers often sync to Google Fit or Health Connect. VitaCare can add Health Connect in a future update—use Elderly Care manual logs for now.",
    };
  }
  return {
    platform: "web",
    healthKit: false,
    hint: "Wearable sync runs in the mobile app on a physical device.",
  };
}

export async function requestHealthAuthorization(): Promise<boolean> {
  return false;
}

export async function syncWearableToVitaCare(): Promise<WearableSyncResult> {
  const caps = getWearableCapabilities();
  return {
    ok: false,
    message: caps.hint,
    posted: { activity: false, vitals: false, sleep: false },
  };
}
