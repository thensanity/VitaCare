import { StatusBar } from "expo-status-bar";
import { Platform, ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { API_BASE } from "@/lib/api";

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>About VitaCare</Text>
        <Text style={styles.body}>
          VitaCare combines a Node API with this Expo app: elderly monitoring
          (vitals, activity, sleep, check-ins, caregiver circle, simulated
          alerts), AI fitness coaching (plans, sessions, voice-ready scripts and
          form cues), plus nutrition macro estimates.
        </Text>
        <Text style={styles.body}>
          Set OPENAI_API_KEY in the server environment for OpenAI-powered text;
          without it, built-in demo logic still returns useful placeholders.
        </Text>
        <Text style={styles.mono}>API: {API_BASE}</Text>
      </ScrollView>
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { padding: 24, paddingTop: 48 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  mono: { fontSize: 12, fontFamily: "SpaceMono", opacity: 0.8, marginTop: 8 },
});
