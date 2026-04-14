import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import {
  API_BASE,
  elderlyApi,
  fitnessApi,
  healthApi,
  nutritionApi,
  wellnessApi,
  type TodaySummary,
} from "@/lib/api";
import { notifyIfNewCareAlert } from "@/lib/careAlerts";
import { syncNotificationScheduleFromServer } from "@/lib/notificationScheduler";
import { useColorScheme } from "@/components/useColorScheme";

export default function HomeScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const router = useRouter();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [insightPreview, setInsightPreview] = useState<string | null>(null);
  const [warnCount, setWarnCount] = useState(0);
  const [fitnessPlanHint, setFitnessPlanHint] = useState<string | null>(null);
  const [wellnessHint, setWellnessHint] = useState<string | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ping, today, insight, latestPlan, wellSum] = await Promise.all([
        healthApi.ping().catch(() => null),
        nutritionApi.todaySummary(),
        elderlyApi.getInsight().catch(() => null),
        fitnessApi.getLatestPlan().catch(() => null),
        wellnessApi.summary().catch(() => null),
      ]);
      setApiOk(!!ping?.ok);
      setSummary(today);
      setInsightPreview(insight?.insight ?? null);
      setWarnCount(insight?.earlyWarnings?.length ?? 0);
      setFitnessPlanHint(
        latestPlan?.summary || latestPlan?.plan?.weekTheme || null
      );
      if (wellSum) {
        setWellnessHint(
          `Water today ${wellSum.hydrationTodayMl} ml · ${wellSum.checkInDaysLast7}/7 check-in days · ${wellSum.activeMedications} med reminders`
        );
      } else {
        setWellnessHint(null);
      }
      await notifyIfNewCareAlert().catch(() => {});
      await syncNotificationScheduleFromServer().catch(() => {});
    } catch {
      setApiOk(false);
      setSummary(null);
      setInsightPreview(null);
      setWarnCount(0);
      setFitnessPlanHint(null);
      setWellnessHint(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>VitaCare</Text>
        <Text style={[styles.tagline, { color: palette.muted }]}>
          Elder care monitoring, AI fitness coaching, and nutrition in one flow.
        </Text>
        <RNView
          style={[
            styles.badge,
            {
              backgroundColor: apiOk ? "rgba(13,148,136,0.15)" : "rgba(234,88,12,0.18)",
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: apiOk ? palette.tint : palette.accent },
            ]}
          >
            {loading
              ? "Checking API…"
              : apiOk
                ? `API connected · ${API_BASE}`
                : "API offline — start server & check URL"}
          </Text>
        </RNView>
      </View>

      {loading ? (
        <ActivityIndicator color={palette.tint} style={{ marginVertical: 24 }} />
      ) : null}

      <Pressable
        onPress={() => router.push("/(tabs)/elderly")}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.cardTitle}>Elderly care monitoring</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Vitals, activity, and sleep patterns feed early-warning-aware AI.
          Caregiver alerts are simulated for demo. Not a medical device.
        </Text>
        {warnCount > 0 ? (
          <Text style={[styles.preview, { color: palette.accent }]}>
            {warnCount} early-warning flag{warnCount === 1 ? "" : "s"} on file—open
            the tab for detail.
          </Text>
        ) : null}
        {insightPreview ? (
          <Text style={styles.preview} numberOfLines={4}>
            {insightPreview}
          </Text>
        ) : null}
        <Text style={[styles.cardCta, { color: palette.tint }]}>
          Open elderly care →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/fitness")}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.cardTitle}>AI fitness coaching</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Personalized plans, session logging for adaptation, and virtual
          coaching with speakable guidance plus form cues.
        </Text>
        {fitnessPlanHint ? (
          <Text style={styles.preview} numberOfLines={2}>
            Latest plan: {fitnessPlanHint}
          </Text>
        ) : (
          <Text style={[styles.preview, { color: palette.muted }]}>
            Generate a plan from your goals and training level.
          </Text>
        )}
        <Text style={[styles.cardCta, { color: palette.tint }]}>
          Open fitness →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/wellness")}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.cardTitle}>Wellness hub & reminders</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Hydration log, medication times, and local notifications for
          check-ins, vitals, meals, and care alerts.
        </Text>
        {wellnessHint ? (
          <Text style={styles.preview} numberOfLines={2}>
            {wellnessHint}
          </Text>
        ) : (
          <Text style={[styles.preview, { color: palette.muted }]}>
            Open to enable reminders on this device.
          </Text>
        )}
        <Text style={[styles.cardCta, { color: palette.tint }]}>
          Open wellness →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/wearable")}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.cardTitle}>Apple Watch & wearables</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Pull steps, heart rate, oxygen, and sleep from Apple Health (fed by
          Apple Watch). Mirror iPhone notifications on your watch for reminders
          and care alerts.
        </Text>
        <Text style={[styles.cardCta, { color: palette.tint }]}>
          Connect & sync →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/nutrition")}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.card,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Text style={styles.cardTitle}>Nutrition tracking</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          Describe what you ate; the app estimates macros and saves a running log
          with practical tips.
        </Text>
        {summary ? (
          <RNView style={styles.statsRow}>
            <Stat label="Today kcal" value={String(Math.round(summary.calories))} />
            <Stat label="Protein g" value={summary.protein.toFixed(0)} />
            <Stat label="Meals" value={String(summary.meals)} />
          </RNView>
        ) : null}
        <Text style={[styles.cardCta, { color: palette.tint }]}>
          Log a meal →
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  return (
    <RNView style={styles.stat}>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </RNView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  hero: { marginBottom: 8 },
  brand: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  tagline: { fontSize: 16, lineHeight: 22, marginTop: 8 },
  badge: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  card: {
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardBody: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  preview: { fontSize: 13, lineHeight: 18, marginTop: 12, fontStyle: "italic" },
  cardCta: { fontSize: 15, fontWeight: "600", marginTop: 14 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 8,
  },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
});
