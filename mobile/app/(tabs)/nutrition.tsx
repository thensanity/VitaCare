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
import { nutritionApi, type NutritionLog, type TodaySummary } from "@/lib/api";
import { useColorScheme } from "@/components/useColorScheme";

const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
] as const;

export default function NutritionScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [mealType, setMealType] = useState<string>("lunch");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [lastTips, setLastTips] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        nutritionApi.todaySummary(),
        nutritionApi.listLogs(),
      ]);
      setToday(s);
      setLogs(l);
    } catch {
      setToday(null);
      setLogs([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submit() {
    const d = description.trim();
    if (d.length < 3) {
      Alert.alert("Describe the meal", "Add a few words so AI can estimate macros.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await nutritionApi.logMeal({
        meal_type: mealType,
        description: d,
      });
      setLastTips(r.tips);
      setDescription("");
      await load();
      Alert.alert(
        "Logged",
        `~${r.calories_est} kcal · P ${r.protein_g}g · C ${r.carbs_g}g · F ${r.fat_g}g`
      );
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not analyze meal."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.headline}>Nutrition</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        Describe ingredients and portions in plain language. With{" "}
        <Text style={{ fontWeight: "700" }}>OPENAI_API_KEY</Text> on the server,
        estimates use a model; otherwise a deterministic demo fills the numbers.
      </Text>

      {today ? (
        <View style={[styles.summary, { backgroundColor: palette.card }]}>
          <Text style={styles.sectionLabel}>Today</Text>
          <RNView style={styles.summaryGrid}>
            <SummaryPill
              label="Calories"
              value={Math.round(today.calories).toString()}
            />
            <SummaryPill
              label="Protein"
              value={`${today.protein.toFixed(0)} g`}
            />
            <SummaryPill label="Carbs" value={`${today.carbs.toFixed(0)} g`} />
            <SummaryPill label="Fat" value={`${today.fat.toFixed(0)} g`} />
          </RNView>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.sectionLabel}>Meal type</Text>
        <RNView style={styles.rowWrap}>
          {MEALS.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setMealType(m.value)}
              style={[
                styles.chipWide,
                {
                  backgroundColor:
                    mealType === m.value
                      ? palette.tint
                      : "rgba(148,163,184,0.2)",
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color: mealType === m.value ? "#fff" : palette.text,
                }}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </RNView>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Grilled salmon, brown rice, side salad with olive oil"
          placeholderTextColor={palette.muted}
          multiline
          style={[
            styles.input,
            { color: palette.text, borderColor: "rgba(148,163,184,0.45)" },
          ]}
        />

        {lastTips ? (
          <Text style={[styles.tips, { color: palette.muted }]}>{lastTips}</Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: palette.accent,
              opacity: submitting || pressed ? 0.85 : 1,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Analyze and log meal</Text>
          )}
        </Pressable>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Recent meals</Text>
      {logs.slice(0, 20).map((log) => (
        <View
          key={log.id}
          style={[styles.listRow, { backgroundColor: palette.card }]}
        >
          <Text style={styles.listTitle}>
            {log.meal_type} · ~{log.calories_est ?? "—"} kcal
          </Text>
          <Text style={[styles.listDesc, { color: palette.muted }]}>
            {log.description}
          </Text>
          <Text style={[styles.listMeta, { color: palette.muted }]}>
            P {log.protein_g?.toFixed(0) ?? "—"}g · C {log.carbs_g?.toFixed(0) ?? "—"}
            g · F {log.fat_g?.toFixed(0) ?? "—"}g ·{" "}
            {log.created_at.replace("T", " ").slice(0, 16)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  return (
    <RNView style={[styles.pill, { backgroundColor: palette.background }]}>
      <Text style={[styles.pillLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  headline: { fontSize: 24, fontWeight: "800" },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  summary: {
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  pill: {
    flexGrow: 1,
    minWidth: "42%",
    borderRadius: 12,
    padding: 12,
  },
  pillLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  pillValue: { fontSize: 18, fontWeight: "800", marginTop: 4 },
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
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chipWide: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  input: {
    marginTop: 8,
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
  },
  tips: { fontSize: 13, lineHeight: 18, marginTop: 12, fontStyle: "italic" },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  listRow: {
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  listTitle: { fontWeight: "700" },
  listDesc: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  listMeta: { fontSize: 12, marginTop: 8 },
});
