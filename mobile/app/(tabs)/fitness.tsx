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
import * as Speech from "expo-speech";
import { useFocusEffect } from "@react-navigation/native";

import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import {
  fitnessApi,
  type FitnessCoach,
  type FitnessPlan,
} from "@/lib/api";
import { useColorScheme } from "@/components/useColorScheme";

export default function FitnessScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const fl = [styles.fieldLabel, { color: palette.muted }];

  const [goals, setGoals] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">(
    "beginner"
  );
  const [preferences, setPreferences] = useState("");
  const [recoveryNotes, setRecoveryNotes] = useState("");

  const [plan, setPlan] = useState<FitnessPlan | null>(null);
  const [planMeta, setPlanMeta] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [workoutName, setWorkoutName] = useState("");
  const [duration, setDuration] = useState("");
  const [effort, setEffort] = useState("");
  const [perfNotes, setPerfNotes] = useState("");

  const [coachExercise, setCoachExercise] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const [coach, setCoach] = useState<FitnessCoach | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await fitnessApi.getProfile();
      setGoals(p.goals);
      setLevel(p.level as "beginner" | "intermediate" | "advanced");
      setPreferences(p.preferences);
      setRecoveryNotes(p.recovery_notes);
    } catch {
      /* ignore */
    }
    try {
      const latest = await fitnessApi.getLatestPlan();
      setPlan(latest.plan);
      setPlanMeta(latest.summary || latest.plan.weekTheme);
    } catch {
      setPlan(null);
      setPlanMeta(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function saveProfile() {
    try {
      await fitnessApi.putProfile({
        goals,
        level,
        preferences,
        recovery_notes: recoveryNotes,
      });
      Alert.alert("Saved", "Profile updated for future plan generation.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function generatePlan() {
    setPlanLoading(true);
    try {
      await fitnessApi.putProfile({
        goals,
        level,
        preferences,
        recovery_notes: recoveryNotes,
      });
      const r = await fitnessApi.generatePlan({
        goals,
        level,
        preferences,
        recovery_notes: recoveryNotes,
      });
      setPlan(r.plan);
      setPlanMeta(r.summary);
      Alert.alert("Ready", "New AI plan generated from your profile.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Plan failed.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function logSession() {
    const name = workoutName.trim();
    if (!name) {
      Alert.alert("Session", "Enter a workout name.");
      return;
    }
    try {
      const d = duration.trim() ? Number(duration) : undefined;
      const eff = effort.trim() ? Number(effort) : undefined;
      await fitnessApi.logSession({
        workout_name: name,
        duration_minutes: d && Number.isFinite(d) ? Math.round(d) : undefined,
        perceived_effort: eff && Number.isFinite(eff) ? Math.round(eff) : undefined,
        performance_notes: perfNotes.trim() || undefined,
      });
      setWorkoutName("");
      setDuration("");
      setEffort("");
      setPerfNotes("");
      Alert.alert("Logged", "Session saved for adaptive coaching.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function runCoach() {
    const ex = coachExercise.trim();
    if (!ex) {
      Alert.alert("Coach", "Which exercise should the virtual coach focus on?");
      return;
    }
    setCoachLoading(true);
    try {
      const c = await fitnessApi.coach({
        exerciseName: ex,
        userNotes: coachNotes.trim() || undefined,
      });
      setCoach(c);
    } catch (e) {
      setCoach(null);
      Alert.alert("Error", e instanceof Error ? e.message : "Coach failed.");
    } finally {
      setCoachLoading(false);
    }
  }

  function playVoice() {
    if (!coach?.voiceScript) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(coach.voiceScript, {
      language: "en-US",
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.headline}>AI fitness coaching</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        Personalized plans adapt to your goals, level, and recovery notes.
        Virtual coaching uses speakable scripts plus form cues—speak is
        on-device TTS (demo, not a trained voice model).
      </Text>

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <Text style={[styles.small, { color: palette.muted }]}>
          Used when generating plans and coaching copy.
        </Text>
        <Text style={fl}>Goals</Text>
        <TextInput
          value={goals}
          onChangeText={setGoals}
          placeholder="e.g. Fat loss, 5k run, stronger back"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Text style={fl}>Level</Text>
        <RNView style={styles.rowWrap}>
          {(["beginner", "intermediate", "advanced"] as const).map((lv) => (
            <Pressable
              key={lv}
              onPress={() => setLevel(lv)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    level === lv ? palette.tint : "rgba(148,163,184,0.2)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: level === lv ? "#fff" : palette.text,
                  textTransform: "capitalize",
                }}
              >
                {lv}
              </Text>
            </Pressable>
          ))}
        </RNView>
        <Text style={fl}>Preferences</Text>
        <TextInput
          value={preferences}
          onChangeText={setPreferences}
          placeholder="Equipment, time caps, music, injuries..."
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Text style={fl}>Recovery & lifestyle</Text>
        <TextInput
          value={recoveryNotes}
          onChangeText={setRecoveryNotes}
          placeholder="Sleep, stress, soreness—helps AI adjust load"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <RNView style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={saveProfile}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: palette.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>
              Save profile
            </Text>
          </Pressable>
          <Pressable
            onPress={generatePlan}
            disabled={planLoading}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: palette.accent,
                flex: 1,
                opacity: planLoading || pressed ? 0.88 : 1,
              },
            ]}
          >
            {planLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Generate AI plan</Text>
            )}
          </Pressable>
        </RNView>
      </View>

      {plan ? (
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <Text style={styles.sectionLabel}>Current plan</Text>
          {planMeta ? (
            <Text style={[styles.planTheme, { color: palette.muted }]}>
              {planMeta}
            </Text>
          ) : null}
          {plan.days.map((d, i) => (
            <RNView key={i} style={styles.dayBlock}>
              <Text style={styles.dayTitle}>
                {d.day} · {d.focus}
              </Text>
              {d.blocks.map((b, j) => (
                <Text key={j} style={styles.blockLine}>
                  • {b.name} ({b.durationMin}m): {b.detail}
                </Text>
              ))}
            </RNView>
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>Log session</Text>
        <Text style={[styles.small, { color: palette.muted }]}>
          Performance and effort inform the next coach response.
        </Text>
        <TextInput
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholder="Workout name"
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <RNView style={styles.row2}>
          <RNView style={{ flex: 1 }}>
            <Text style={fl}>Minutes</Text>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="35"
              placeholderTextColor={palette.muted}
              style={[
                styles.input,
                { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
              ]}
            />
          </RNView>
          <RNView style={{ flex: 1 }}>
            <Text style={fl}>Effort 1–10</Text>
            <TextInput
              value={effort}
              onChangeText={setEffort}
              keyboardType="number-pad"
              placeholder="7"
              placeholderTextColor={palette.muted}
              style={[
                styles.input,
                { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
              ]}
            />
          </RNView>
        </RNView>
        <TextInput
          value={perfNotes}
          onChangeText={setPerfNotes}
          placeholder="What felt hard? Joint pain? PRs?"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Pressable
          onPress={logSession}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={styles.primaryBtnText}>Save session</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>Virtual coach</Text>
        <Text style={[styles.small, { color: palette.muted }]}>
          Form correction cues + adaptation. Tap speak for voice guidance.
        </Text>
        <TextInput
          value={coachExercise}
          onChangeText={setCoachExercise}
          placeholder="Exercise name (e.g. Romanian deadlift)"
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <TextInput
          value={coachNotes}
          onChangeText={setCoachNotes}
          placeholder="Optional: how it felt today"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />
        <Pressable
          onPress={runCoach}
          disabled={coachLoading}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.accent,
              opacity: coachLoading || pressed ? 0.88 : 1,
            },
          ]}
        >
          {coachLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Get AI coaching</Text>
          )}
        </Pressable>

        {coach ? (
          <>
            <Text style={[styles.coachScript, { color: palette.text }]}>
              {coach.voiceScript}
            </Text>
            <Pressable
              onPress={playVoice}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  borderColor: palette.tint,
                  marginTop: 10,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>
                {speaking ? "Stop voice" : "Play voice guidance"}
              </Text>
            </Pressable>
            <Text style={[...fl, { marginTop: 14 }]}>Form cues</Text>
            {coach.formCues.map((c, i) => (
              <Text key={i} style={styles.cue}>
                • {c}
              </Text>
            ))}
            <Text style={[...fl, { marginTop: 10 }]}>Adaptation</Text>
            <Text style={{ fontSize: 14, lineHeight: 20 }}>
              {coach.adaptationNote}
            </Text>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  headline: { fontSize: 24, fontWeight: "800" },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
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
  small: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    textAlignVertical: "top",
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  row2: { flexDirection: "row", gap: 10, marginTop: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  secondaryBtnText: { fontWeight: "600", fontSize: 14 },
  planTheme: { fontSize: 15, fontWeight: "600", marginTop: 10 },
  dayBlock: { marginTop: 14 },
  dayTitle: { fontWeight: "800", fontSize: 16, marginBottom: 6 },
  blockLine: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  coachScript: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  cue: { fontSize: 14, lineHeight: 20, marginTop: 4 },
});
