import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import {
  elderlyApi,
  type CareAlert,
  type Caregiver,
  type CheckIn,
  type ElderlyInsight,
} from "@/lib/api";
import { useColorScheme } from "@/components/useColorScheme";

const MOBILITY = [
  { value: "independent", label: "Independent" },
  { value: "cane", label: "Cane" },
  { value: "walker", label: "Walker" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "assisted", label: "Assisted" },
] as const;

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function ElderlyCareScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];

  const [mood, setMood] = useState(4);
  const [mobility, setMobility] = useState<string>("independent");
  const [sleep, setSleep] = useState<number | null>(4);
  const [notes, setNotes] = useState("");
  const [insight, setInsight] = useState<ElderlyInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [list, setList] = useState<CheckIn[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [hr, setHr] = useState("");
  const [bps, setBps] = useState("");
  const [bpd, setBpd] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");
  const [vitalNotes, setVitalNotes] = useState("");

  const [steps, setSteps] = useState("");
  const [activeMin, setActiveMin] = useState("");
  const [actIntensity, setActIntensity] = useState<
    "light" | "moderate" | "vigorous"
  >("light");

  const [sleepHours, setSleepHours] = useState("7");
  const [sleepQ, setSleepQ] = useState(4);
  const [bedtime, setBedtime] = useState<"regular" | "irregular" | "unknown">(
    "unknown"
  );
  const [sleepNotes, setSleepNotes] = useState("");

  const [cgName, setCgName] = useState("");
  const [cgPhone, setCgPhone] = useState("");
  const [cgRel, setCgRel] = useState("");

  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [alerts, setAlerts] = useState<CareAlert[]>([]);

  const refreshInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const r = await elderlyApi.getInsight();
      setInsight(r);
    } catch (e) {
      setInsight(null);
      Alert.alert(
        "Insight unavailable",
        e instanceof Error ? e.message : "Is the API running?"
      );
    } finally {
      setInsightLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const rows = await elderlyApi.listCheckIns();
      setList(rows);
    } catch {
      setList([]);
    }
  }, []);

  const loadCare = useCallback(async () => {
    try {
      const [cg, al] = await Promise.all([
        elderlyApi.listCaregivers(),
        elderlyApi.listAlerts(),
      ]);
      setCaregivers(cg);
      setAlerts(al);
    } catch {
      setCaregivers([]);
      setAlerts([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadList();
      loadCare();
      refreshInsight();
    }, [loadList, loadCare, refreshInsight])
  );

  async function submitCheckIn() {
    setSubmitting(true);
    try {
      await elderlyApi.submitCheckIn({
        mood,
        mobility,
        sleep_quality: sleep ?? undefined,
        notes: notes.trim() || undefined,
      });
      setNotes("");
      await loadList();
      await refreshInsight();
      Alert.alert("Saved", "Check-in recorded.");
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not save check-in."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVitals() {
    try {
      await elderlyApi.submitVitals({
        heart_rate_bpm: numOrUndef(hr),
        bp_systolic: numOrUndef(bps),
        bp_diastolic: numOrUndef(bpd),
        spo2_pct: numOrUndef(spo2),
        temperature_c: numOrUndef(temp),
        source: "manual",
        notes: vitalNotes.trim() || undefined,
      });
      setVitalNotes("");
      await refreshInsight();
      await loadCare();
      Alert.alert(
        "Saved",
        "Vitals logged. Pair wearables in production for automatic feeds."
      );
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to save vitals."
      );
    }
  }

  async function submitActivity() {
    try {
      await elderlyApi.submitActivity({
        steps: numOrUndef(steps),
        active_minutes: numOrUndef(activeMin),
        intensity: actIntensity,
        source: "manual",
      });
      await refreshInsight();
      await loadCare();
      Alert.alert("Saved", "Activity logged.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function submitSleepLog() {
    const h = Number(sleepHours);
    if (!Number.isFinite(h) || h <= 0) {
      Alert.alert("Sleep hours", "Enter hours slept (e.g. 6.5).");
      return;
    }
    try {
      await elderlyApi.submitSleep({
        hours_slept: h,
        sleep_quality: sleepQ,
        bedtime_consistency: bedtime,
        notes: sleepNotes.trim() || undefined,
      });
      setSleepNotes("");
      await refreshInsight();
      await loadCare();
      Alert.alert("Saved", "Sleep pattern saved.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function addCaregiver() {
    if (!cgName.trim() || !cgPhone.trim()) {
      Alert.alert("Caregiver", "Name and phone are required.");
      return;
    }
    try {
      await elderlyApi.addCaregiver({
        name: cgName.trim(),
        phone: cgPhone.trim(),
        relation: cgRel.trim() || undefined,
      });
      setCgName("");
      setCgPhone("");
      setCgRel("");
      await loadCare();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  function confirmEmergency() {
    Alert.alert(
      "Caregiver alert",
      "Log an emergency and simulate notifying your care circle? Use real emergency services for life-threatening situations.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log and notify (simulated)",
          style: "destructive",
          onPress: () => void sendEmergency(),
        },
      ]
    );
  }

  async function sendEmergency() {
    try {
      const r = await elderlyApi.createAlert({
        severity: "emergency",
        title: "User requested an urgent care-team heads-up",
        detail:
          "Opened from VitaCare elderly monitoring. Escalate per your protocol. Demo only: SMS not sent.",
      });
      await loadCare();
      Alert.alert(
        "Recorded",
        r.caregiverNotifySimulated
          ? "Alert stored; caregivers marked notified in-app (demo)."
          : "Alert stored. Add caregivers to simulate notifications."
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function removeCg(id: number) {
    try {
      await elderlyApi.deleteCaregiver(id);
      await loadCare();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.headline}>Elderly care monitoring</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        Vitals, activity, and sleep feed AI summaries and early-warning flags.
        Caregiver alerts are simulated in this demo build.
      </Text>

      <Pressable
        onPress={confirmEmergency}
        style={({ pressed }) => [
          styles.sos,
          { backgroundColor: "#b91c1c", opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text style={styles.sosText}>Caregiver alert (simulated)</Text>
      </Pressable>

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>AI monitoring brief</Text>
        {insightLoading ? (
          <ActivityIndicator color={palette.tint} style={{ marginVertical: 12 }} />
        ) : (
          <>
            <Text style={styles.insightText}>{insight?.insight ?? "—"}</Text>
            {insight?.earlyWarnings?.length ? (
              <RNView style={{ marginTop: 12 }}>
                <Text style={[styles.warnTitle, { color: palette.accent }]}>
                  Early warnings
                </Text>
                {insight.earlyWarnings.map((w, i) => (
                  <Text
                    key={i}
                    style={[styles.warnItem, { color: palette.text }]}
                  >
                    • {w}
                  </Text>
                ))}
              </RNView>
            ) : null}
            {insight?.caregiverAlertSuggested ? (
              <Text style={[styles.alertFlag, { color: palette.accent }]}>
                Suggested care-team heads-up:{" "}
                {insight.caregiverAlertReason || "Review recent alerts."}
              </Text>
            ) : null}
          </>
        )}
        <Pressable
          onPress={refreshInsight}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: palette.tint, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>
            Refresh AI brief
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
        Vitals (manual / device-ready)
      </Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <RNView style={styles.row2}>
          <Field label="Heart rate" value={hr} onChange={setHr} ph="bpm" />
          <Field label="SpO₂" value={spo2} onChange={setSpo2} ph="%" />
        </RNView>
        <RNView style={styles.row2}>
          <Field label="BP sys" value={bps} onChange={setBps} ph="mmHg" />
          <Field label="BP dia" value={bpd} onChange={setBpd} ph="mmHg" />
        </RNView>
        <Field label="Temp °C" value={temp} onChange={setTemp} ph="e.g. 36.6" />
        <Text style={[styles.smallLabel, { color: palette.muted }]}>Notes</Text>
        <TextInput
          value={vitalNotes}
          onChangeText={setVitalNotes}
          placeholder="Optional context (meds, symptoms)"
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Pressable
          onPress={submitVitals}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.tint,
              opacity: pressed ? 0.88 : 1,
              marginTop: 12,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>Save vitals</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Activity</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <RNView style={styles.row2}>
          <Field label="Steps" value={steps} onChange={setSteps} ph="count" />
          <Field
            label="Active min"
            value={activeMin}
            onChange={setActiveMin}
            ph="min"
          />
        </RNView>
        <Text style={styles.smallLabel}>Intensity</Text>
        <RNView style={styles.rowWrap}>
          {(["light", "moderate", "vigorous"] as const).map((x) => (
            <Pressable
              key={x}
              onPress={() => setActIntensity(x)}
              style={[
                styles.chipWide,
                {
                  backgroundColor:
                    actIntensity === x ? palette.tint : "rgba(148,163,184,0.2)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color: actIntensity === x ? "#fff" : palette.text,
                  textTransform: "capitalize",
                }}
              >
                {x}
              </Text>
            </Pressable>
          ))}
        </RNView>
        <Pressable
          onPress={submitActivity}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.tint,
              opacity: pressed ? 0.88 : 1,
              marginTop: 12,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>Save activity</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Sleep patterns</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Field
          label="Hours slept"
          value={sleepHours}
          onChange={setSleepHours}
          ph="e.g. 7.5"
        />
        <Text style={[styles.smallLabel, { marginTop: 12 }]}>Quality 1–5</Text>
        <RNView style={styles.rowWrap}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setSleepQ(n)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    sleepQ === n ? palette.accent : "rgba(148,163,184,0.25)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: sleepQ === n ? "#fff" : palette.text,
                }}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </RNView>
        <Text style={[styles.smallLabel, { marginTop: 12 }]}>Bedtime rhythm</Text>
        <RNView style={styles.rowWrap}>
          {(
            [
              ["regular", "Regular"],
              ["irregular", "Irregular"],
              ["unknown", "Unknown"],
            ] as const
          ).map(([v, lab]) => (
            <Pressable
              key={v}
              onPress={() => setBedtime(v)}
              style={[
                styles.chipWide,
                {
                  backgroundColor:
                    bedtime === v ? palette.tint : "rgba(148,163,184,0.2)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color: bedtime === v ? "#fff" : palette.text,
                }}
              >
                {lab}
              </Text>
            </Pressable>
          ))}
        </RNView>
        <TextInput
          value={sleepNotes}
          onChangeText={setSleepNotes}
          placeholder="Optional sleep notes"
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: "rgba(148,163,184,0.45)",
              marginTop: 8,
            },
          ]}
        />
        <Pressable
          onPress={submitSleepLog}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.tint,
              opacity: pressed ? 0.88 : 1,
              marginTop: 12,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>Save sleep log</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Care circle</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.smallLabel}>Name</Text>
        <TextInput
          value={cgName}
          onChangeText={setCgName}
          placeholder="Family or clinician contact"
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Text style={[styles.smallLabel, { marginTop: 8 }]}>Phone</Text>
        <TextInput
          value={cgPhone}
          onChangeText={setCgPhone}
          placeholder="+1 ..."
          placeholderTextColor={palette.muted}
          keyboardType="phone-pad"
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Text style={[styles.smallLabel, { marginTop: 8 }]}>Relation</Text>
        <TextInput
          value={cgRel}
          onChangeText={setCgRel}
          placeholder="Daughter, nurse..."
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Pressable
          onPress={addCaregiver}
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              borderColor: palette.tint,
              marginTop: 12,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>
            Add caregiver
          </Text>
        </Pressable>
        {caregivers.map((c) => (
          <RNView
            key={c.id}
            style={[styles.cgRow, { borderColor: "rgba(148,163,184,0.35)" }]}
          >
            <RNView style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700" }}>{c.name}</Text>
              <Text style={{ color: palette.muted, fontSize: 13 }}>
                {c.phone}
                {c.relation ? ` · ${c.relation}` : ""}
              </Text>
            </RNView>
            <Pressable onPress={() => removeCg(c.id)}>
              <Text style={{ color: palette.accent, fontWeight: "600" }}>
                Remove
              </Text>
            </Pressable>
          </RNView>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Alert log</Text>
      {alerts.slice(0, 12).map((a) => (
        <View
          key={a.id}
          style={[styles.listRow, { backgroundColor: palette.card }]}
        >
          <Text style={styles.listTitle}>
            [{a.severity}] {a.title}
          </Text>
          <Text style={[styles.listMeta, { color: palette.muted }]}>
            {a.created_at.replace("T", " ").slice(0, 16)} ·{" "}
            {a.triggered_by}
            {a.caregiver_notify_simulated
              ? " · caregivers notified (sim.)"
              : ""}
          </Text>
          <Text style={styles.listNotes}>{a.detail}</Text>
        </View>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Daily check-in</Text>
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>Mood (1–5)</Text>
        <RNView style={styles.rowWrap}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setMood(n)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    mood === n ? palette.tint : "rgba(148,163,184,0.25)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: mood === n ? "#fff" : palette.text,
                }}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Mobility</Text>
        <RNView style={styles.rowWrap}>
          {MOBILITY.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setMobility(m.value)}
              style={[
                styles.chipWide,
                {
                  backgroundColor:
                    mobility === m.value
                      ? palette.tint
                      : "rgba(148,163,184,0.2)",
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: mobility === m.value ? "#fff" : palette.text,
                }}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
          Sleep quality (quick, optional)
        </Text>
        <RNView style={styles.rowWrap}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setSleep((s) => (s === n ? null : n))}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    sleep === n ? palette.accent : "rgba(148,163,184,0.25)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: sleep === n ? "#fff" : palette.text,
                }}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="How are you feeling today?"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />

        <Pressable
          onPress={submitCheckIn}
          disabled={submitting}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.tint,
              opacity: submitting || pressed ? 0.85 : 1,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Save check-in</Text>
          )}
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Recent check-ins</Text>
      {list.slice(0, 8).map((c) => (
        <View
          key={c.id}
          style={[styles.listRow, { backgroundColor: palette.card }]}
        >
          <Text style={styles.listTitle}>
            Mood {c.mood} · {c.mobility}
          </Text>
          <Text style={[styles.listMeta, { color: palette.muted }]}>
            {c.created_at.replace("T", " ").slice(0, 16)}
            {c.sleep_quality != null ? ` · sleep ${c.sleep_quality}/5` : ""}
          </Text>
          {c.notes ? (
            <Text style={styles.listNotes} numberOfLines={3}>
              {c.notes}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  ph,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  ph: string;
}) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  return (
    <RNView style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.smallLabel, { color: palette.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={ph}
        placeholderTextColor={palette.muted}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: "rgba(148,163,184,0.45)",
            marginTop: 4,
          },
        ]}
      />
    </RNView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  headline: { fontSize: 24, fontWeight: "800" },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  sos: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  sosText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  smallLabel: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  insightText: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  warnTitle: { fontWeight: "800", marginBottom: 6 },
  warnItem: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  alertFlag: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  row2: { flexDirection: "row", gap: 10, marginTop: 4 },
  chip: {
    minWidth: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipWide: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: "600", fontSize: 14 },
  cgRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  listRow: {
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  listTitle: { fontWeight: "700" },
  listMeta: { fontSize: 12, marginTop: 4 },
  listNotes: { fontSize: 14, marginTop: 8 },
});
