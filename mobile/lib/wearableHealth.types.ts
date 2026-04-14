export type WearableCapabilities = {
  platform: "ios" | "android" | "web";
  /** True when Apple HealthKit can run on this build (iOS device + dev client). */
  healthKit: boolean;
  hint: string;
};

export type WearableSyncResult = {
  ok: boolean;
  message: string;
  posted: {
    activity: boolean;
    vitals: boolean;
    sleep: boolean;
  };
};
