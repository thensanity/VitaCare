import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import {
  getWearableCapabilities,
  requestHealthAuthorization,
  syncWearableToVitaCare,
} from "@/lib/wearableHealth";

export default function WearableScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const caps = getWearableCapabilities();

  const [busy, setBusy] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLastMessage(null);
    }, [])
  );

  async function onConnectHealth() {
    if (Platform.OS !== "ios") {
      Alert.alert(
        "Apple Health",
        "Direct Health sync is built for iPhone. On Android, use manual logs today; Health Connect may be added later."
      );
      return;
    }
    if (!caps.healthKit) {
      Alert.alert(
        "HealthKit unavailable",
        caps.hint +
          " On Apple Watch: enable mirror for VitaCare notifications under Watch ▸ Notifications."
      );
      return;
    }
    setBusy(true);
    try {
      await requestHealthAuthorization();
      Alert.alert(
        "Health access",
        "If a prompt did not appear, open Settings ▸ Privacy & Security ▸ Health ▸ VitaCare and enable read access for Steps, Heart Rate, Oxygen, and Sleep."
      );
    } catch (e) {
      Alert.alert(
        "Permission",
        e instanceof Error ? e.message : "Could not request Health access."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    setLastMessage(null);
    try {
      const r = await syncWearableToVitaCare();
      setLastMessage(r.message);
      if (r.ok) {
        Alert.alert("Synced", r.message);
      } else {
        Alert.alert("Sync", r.message);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Sync failed.";
      setLastMessage(m);
      Alert.alert("Error", m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.h1}>Watch & wearables</Text>
      <Text style={[styles.sub, { color: palette.muted }]}>
        Apple Watch does not install VitaCare as a full watchOS app here—instead,
        your watch writes to Apple Health on iPhone, and VitaCare reads that data
        after you allow it. Notifications you allow on iPhone can mirror to the
        watch (Watch app ▸ Notifications ▸ mirror VitaCare).
      </Text>

      <RNView style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.cardTitle}>This device</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          {caps.platform === "ios"
            ? caps.healthKit
              ? "HealthKit is available. Use the buttons below to authorize and sync."
              : caps.hint
            : caps.hint}
        </Text>
      </RNView>

      <Pressable
        disabled={busy || Platform.OS !== "ios"}
        onPress={onConnectHealth}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: palette.tint,
            opacity: pressed || busy || Platform.OS !== "ios" ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.primaryText}>
          {Platform.OS === "ios"
            ? "Allow Apple Health access"
            : "Apple Health (iPhone only)"}
        </Text>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={onSync}
        style={({ pressed }) => [
          styles.secondary,
          {
            borderColor: palette.tint,
            opacity: pressed || busy ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.secondaryText, { color: palette.tint }]}>
          Sync now to VitaCare
        </Text>
      </Pressable>

      {busy ? (
        <ActivityIndicator color={palette.tint} style={{ marginTop: 20 }} />
      ) : null}

      {lastMessage ? (
        <Text style={[styles.note, { color: palette.muted }]}>{lastMessage}</Text>
      ) : null}

      <RNView style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={styles.cardTitle}>What gets synced</Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          · Steps today → Elderly Care activity log{"\n"}· Latest heart rate,
          SpO₂, resting HR note → vitals{"\n"}· Recent sleep window → sleep log
          (estimated hours){"\n"}
          {"\n"}
          All use source &quot;apple_health&quot; on the server. Confirm
          abnormal readings with a clinician—consumer wearables can be wrong.
        </Text>
      </RNView>

      {Platform.OS === "ios" ? (
        <Pressable
          onPress={() =>
            Linking.openURL("x-apple-health://").catch(() => {})
          }
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: palette.tint, fontWeight: "600" }}>
            Open Apple Health
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 26, fontWeight: "800" },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  card: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  cardBody: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  primary: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  secondaryText: { fontWeight: "700", fontSize: 16 },
  note: { marginTop: 16, fontSize: 13, lineHeight: 18 },
});
