import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View as RNView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import {
  type Medication,
  type ReminderPreferences,
  wellnessApi,
} from "@/lib/api";
import {
  ensureNotificationPermissions,
  rescheduleAllNotifications,
  syncNotificationScheduleFromServer,
} from "@/lib/notificationScheduler";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseSlots(s: string): number[] | null {
  const parts = s
    .split(/[, ]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const hrs = parts.map((p) => Number(p));
  if (!hrs.length || hrs.some((h) => !Number.isInteger(h) || h < 0 || h > 23))
    return null;
  return [...new Set(hrs)].sort((a, b) => a - b);
}

export default function WellnessScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ReminderPreferences | null>(null);
  const [hydrationTotal, setHydrationTotal] = useState<{
    total_ml: number;
    logs: number;
  } | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [summary, setSummary] = useState<{
    hydrationTodayMl: number;
    checkInDaysLast7: number;
    activeMedications: number;
  } | null>(null);

  const [newMedLabel, setNewMedLabel] = useState("");
  const [newMedTimes, setNewMedTimes] = useState("09:00, 21:00");
  const [slotsText, setSlotsText] = useState("10, 13, 16, 19");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h, m, su] = await Promise.all([
        wellnessApi.getPreferences(),
        wellnessApi.hydrationToday(),
        wellnessApi.listMedications(),
        wellnessApi.summary(),
      ]);
      setPrefs(p);
      setHydrationTotal(h);
      setMedications(m);
      setSummary(su);
      setSlotsText(p.hydration.slots.join(", "));
    } catch {
      setPrefs(null);
      setHydrationTotal(null);
      setMedications([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onLogWater(ml: number) {
    setHydrating(true);
    try {
      await wellnessApi.logHydration({ amount_ml: ml });
      const [h, su] = await Promise.all([
        wellnessApi.hydrationToday(),
        wellnessApi.summary(),
      ]);
      setHydrationTotal(h);
      setSummary(su);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Try again");
    } finally {
      setHydrating(false);
    }
  }

  async function addMedication() {
    const label = newMedLabel.trim();
    if (label.length < 1) {
      Alert.alert("Name", "Enter a short label (e.g. Vitamin D).");
      return;
    }
    const times = newMedTimes
      .split(/[, ]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!times.length || times.some((t) => !TIME_RE.test(t))) {
      Alert.alert(
        "Times",
        'Use 24h times like 08:00 and 20:00, comma-separated.'
      );
      return;
    }
    try {
      await wellnessApi.addMedication({ label, schedule_times: times });
      setNewMedLabel("");
      const m = await wellnessApi.listMedications();
      setMedications(m);
      if (prefs)
        await rescheduleAllNotifications(prefs, m).catch(() => {});
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save.");
    }
  }

  async function removeMedication(id: number) {
    try {
      await wellnessApi.deleteMedication(id);
      const m = await wellnessApi.listMedications();
      setMedications(m);
      if (prefs) await rescheduleAllNotifications(prefs, m).catch(() => {});
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function toggleMedEnabled(med: Medication) {
    try {
      await wellnessApi.setMedicationEnabled(med.id, !med.enabled);
      const m = await wellnessApi.listMedications();
      setMedications(m);
      if (prefs) await rescheduleAllNotifications(prefs, m).catch(() => {});
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Update failed.");
    }
  }

  async function savePrefsAndSchedule() {
    if (!prefs) return;
    const slots = parseSlots(slotsText);
    if (!slots) {
      Alert.alert(
        "Hydration hours",
        "Enter 1–12 hours 0–23, comma-separated (e.g. 10, 13, 16)."
      );
      return;
    }
    const next: ReminderPreferences = {
      ...prefs,
      hydration: { ...prefs.hydration, slots },
    };
    setSavingPrefs(true);
    try {
      const saved = await wellnessApi.putPreferences(next);
      setPrefs(saved);
      const perm = await ensureNotificationPermissions();
      if (!perm) {
        Alert.alert(
          "Notifications off",
          "Enable notifications in system settings to get reminders."
        );
      }
      await rescheduleAllNotifications(saved, medications);
      Alert.alert("Saved", "Reminder schedule updated on this device.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingPrefs(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.tint} />
        <Text style={{ marginTop: 12, color: palette.muted }}>Loading…</Text>
      </View>
    );
  }

  if (!prefs) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.text, textAlign: "center", padding: 24 }}>
          Could not load wellness data. Start the VitaCare API server and check
          EXPO_PUBLIC_API_URL.
        </Text>
        <Pressable onPress={load} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.h1}>Wellness hub</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        Hydration logging, medication prompts, and smart local reminders. Not
        medical advice—confirm prescriptions with your clinician.
      </Text>

      {summary ? (
        <RNView
          style={[styles.metrics, { backgroundColor: palette.card }]}
        >
          <Metric
            label="Water today"
            value={`${summary.hydrationTodayMl} ml`}
            palette={palette}
          />
          <Metric
            label="Check-in days (7d)"
            value={String(summary.checkInDaysLast7)}
            palette={palette}
          />
          <Metric
            label="Active meds"
            value={String(summary.activeMedications)}
            palette={palette}
          />
        </RNView>
      ) : null}

      <RNView style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.cardTitle}>Hydration</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Quick log volumes saved to your VitaCare server. Aim for what your
          provider suggested—common targets are personal.
        </Text>
        {hydrationTotal ? (
          <Text style={styles.emphasis}>
            Today: {hydrationTotal.total_ml} ml · {hydrationTotal.logs} log
            {hydrationTotal.logs === 1 ? "" : "s"}
          </Text>
        ) : null}
        <RNView style={styles.row}>
          <Pressable
            disabled={hydrating}
            onPress={() => onLogWater(250)}
            style={[styles.chip, { borderColor: palette.tint }]}
          >
            <Text style={{ color: palette.tint, fontWeight: "700" }}>
              +250 ml
            </Text>
          </Pressable>
          <Pressable
            disabled={hydrating}
            onPress={() => onLogWater(500)}
            style={[styles.chip, { borderColor: palette.tint }]}
          >
            <Text style={{ color: palette.tint, fontWeight: "700" }}>
              +500 ml
            </Text>
          </Pressable>
        </RNView>
      </RNView>

      <RNView style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.cardTitle}>Medication reminders</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Local notifications only. Times are 24h on your phone. VitaCare does
          not verify doses or interactions.
        </Text>
        {medications.map((m) => (
          <RNView key={m.id} style={styles.medRow}>
            <RNView style={{ flex: 1 }}>
              <Text style={styles.medLabel}>{m.label}</Text>
              <Text style={[styles.medTimes, { color: palette.muted }]}>
                {m.schedule_times.join(" · ")}
              </Text>
            </RNView>
            <Switch
              value={m.enabled}
              onValueChange={() => toggleMedEnabled(m)}
            />
            <Pressable onPress={() => removeMedication(m.id)} style={styles.trash}>
              <Text style={{ color: palette.accent }}>Remove</Text>
            </Pressable>
          </RNView>
        ))}
        <TextInput
          placeholder="Label (e.g. Metformin)"
          placeholderTextColor={palette.muted}
          value={newMedLabel}
          onChangeText={setNewMedLabel}
          style={[
            styles.input,
            { color: palette.text, borderColor: palette.muted },
          ]}
        />
        <TextInput
          placeholder="Times: 08:00, 20:00"
          placeholderTextColor={palette.muted}
          value={newMedTimes}
          onChangeText={setNewMedTimes}
          style={[
            styles.input,
            { color: palette.text, borderColor: palette.muted },
          ]}
        />
        <Pressable onPress={addMedication} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Add medication</Text>
        </Pressable>
      </RNView>

      <RNView style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.cardTitle}>Reminders & notifications</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Master switch and times apply to this device. Tap save to reschedule.
        </Text>

        <RNView style={styles.switchRow}>
          <Text style={styles.switchLabel}>All reminders</Text>
          <Switch
            value={prefs.masterEnabled}
            onValueChange={(v) => setPrefs({ ...prefs, masterEnabled: v })}
          />
        </RNView>
        <RNView style={styles.switchRow}>
          <Text style={styles.switchLabel}>Notify on new care alerts</Text>
          <Switch
            value={prefs.notifyNewCareAlerts}
            onValueChange={(v) =>
              setPrefs({ ...prefs, notifyNewCareAlerts: v })
            }
          />
        </RNView>

        <TimeBlock
          label="Daily check-in"
          pref={prefs.checkIn}
          palette={palette}
          onChange={(p) => setPrefs({ ...prefs, checkIn: p })}
        />
        <TimeBlock
          label="Vitals log"
          pref={prefs.vitals}
          palette={palette}
          onChange={(p) => setPrefs({ ...prefs, vitals: p })}
        />
        <TimeBlock
          label="Lunch meal log"
          pref={prefs.lunchMeal}
          palette={palette}
          onChange={(p) => setPrefs({ ...prefs, lunchMeal: p })}
        />
        <TimeBlock
          label="Fitness / movement"
          pref={prefs.fitness}
          palette={palette}
          onChange={(p) => setPrefs({ ...prefs, fitness: p })}
        />
        <TimeBlock
          label="Evening care review"
          pref={prefs.careReview}
          palette={palette}
          onChange={(p) => setPrefs({ ...prefs, careReview: p })}
        />

        <RNView style={styles.switchRow}>
          <Text style={styles.switchLabel}>Hydration nudges</Text>
          <Switch
            value={prefs.hydration.enabled}
            onValueChange={(v) =>
              setPrefs({
                ...prefs,
                hydration: { ...prefs.hydration, enabled: v },
              })
            }
          />
        </RNView>
        <Text style={[styles.small, { color: palette.muted }]}>
          Hours (0–23), comma-separated, local time
        </Text>
        <TextInput
          value={slotsText}
          onChangeText={setSlotsText}
          style={[
            styles.input,
            { color: palette.text, borderColor: palette.muted },
          ]}
        />

        <Pressable
          disabled={savingPrefs}
          onPress={savePrefsAndSchedule}
          style={[
            styles.primaryBtn,
            { opacity: savingPrefs ? 0.7 : 1, marginTop: 12 },
          ]}
        >
          <Text style={styles.primaryBtnText}>
            {savingPrefs ? "Saving…" : "Save & apply to this device"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            syncNotificationScheduleFromServer()
              .then(() => load())
              .then(() =>
                Alert.alert("Synced", "Reloaded schedule from the server.")
              )
          }
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: palette.tint, fontWeight: "600" }}>
            Resync from server
          </Text>
        </Pressable>
      </RNView>
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: (typeof Colors)[keyof typeof Colors];
}) {
  return (
    <RNView style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.small, { color: palette.muted }]}>{label}</Text>
      <Text style={styles.metricVal}>{value}</Text>
    </RNView>
  );
}

function TimeBlock({
  label,
  pref,
  palette,
  onChange,
}: {
  label: string;
  pref: { enabled: boolean; hour: number; minute: number };
  palette: (typeof Colors)[keyof typeof Colors];
  onChange: (p: { enabled: boolean; hour: number; minute: number }) => void;
}) {
  return (
    <>
      <RNView style={styles.switchRow}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch
          value={pref.enabled}
          onValueChange={(v) => onChange({ ...pref, enabled: v })}
        />
      </RNView>
      {pref.enabled ? (
        <RNView style={styles.timeRow}>
          <Text style={{ color: palette.muted, width: 42 }}>H</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            value={String(pref.hour)}
            onChangeText={(t) => {
              const n = Math.min(23, Math.max(0, Number(t) || 0));
              onChange({ ...pref, hour: n });
            }}
            style={[
              styles.timeInput,
              { color: palette.text, borderColor: palette.muted },
            ]}
          />
          <Text style={{ color: palette.muted, marginHorizontal: 8 }}>M</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            value={String(pref.minute)}
            onChangeText={(t) => {
              const n = Math.min(59, Math.max(0, Number(t) || 0));
              onChange({ ...pref, minute: n });
            }}
            style={[
              styles.timeInput,
              { color: palette.text, borderColor: palette.muted },
            ]}
          />
        </RNView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 26, fontWeight: "800" },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  metrics: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  cardBody: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  emphasis: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  medLabel: { fontSize: 16, fontWeight: "600" },
  medTimes: { fontSize: 13, marginTop: 2 },
  trash: { paddingHorizontal: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: "#0d9488",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  switchLabel: { fontSize: 15, flex: 1, paddingRight: 12 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: 8,
    width: 48,
    padding: 8,
    fontSize: 16,
    textAlign: "center",
  },
  small: { fontSize: 12, marginTop: 4 },
  metricVal: { fontSize: 18, fontWeight: "800", marginTop: 4 },
});
