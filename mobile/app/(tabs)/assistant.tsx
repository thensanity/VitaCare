import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from "react-native";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { useFocusEffect } from "@react-navigation/native";

import { Text, View } from "@/components/Themed";
import Colors from "@/constants/Colors";
import { chatApi, type ChatMsg } from "@/lib/api";
import { useColorScheme } from "@/components/useColorScheme";

type Row = ChatMsg & { id: string };

let msgId = 0;
function nextId() {
  msgId += 1;
  return `${Date.now()}-${msgId}`;
}

export default function AssistantScreen() {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<Audio.Recording | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Speech.stop();
        void recRef.current?.stopAndUnloadAsync().catch(() => undefined);
        recRef.current = null;
      };
    }, [])
  );

  const historyForApi = useCallback((): ChatMsg[] => {
    return rows.map((r) => ({ role: r.role, content: r.content }));
  }, [rows]);

  async function sendFromText() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    await runChatTurn(t);
  }

  async function runChatTurn(userText: string) {
    const userRow: Row = { id: nextId(), role: "user", content: userText };
    setRows((prev) => [...prev, userRow]);
    setBusy(true);
    try {
      const nextHistory = [...historyForApi(), { role: "user" as const, content: userText }];
      const { reply } = await chatApi.send(nextHistory);
      setRows((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: reply },
      ]);
    } catch (e) {
      setRows((prev) => prev.filter((r) => r.id !== userRow.id));
      Alert.alert(
        "Chat failed",
        e instanceof Error ? e.message : "Check API key and network."
      );
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (Platform.OS === "web") {
      Alert.alert(
        "Voice",
        "Voice capture runs on iOS/Android with Expo Go or a dev build. On web, type your message."
      );
      return;
    }
    if (busy || recording) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Microphone", "Permission is needed to record your question.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      Alert.alert("Recording", e instanceof Error ? e.message : "Could not start.");
    }
  }

  async function stopRecordingAndSend() {
    const rec = recRef.current;
    if (!rec || !recording) return;
    setRecording(false);
    recRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        Alert.alert("Voice", "No audio captured.");
        return;
      }
      const text = (await chatApi.transcribe(uri)).trim();
      if (!text) {
        Alert.alert("Voice", "Could not understand audio. Try again.");
        return;
      }
      await runChatTurn(text);
    } catch (e) {
      Alert.alert(
        "Voice",
        e instanceof Error ? e.message : "Transcription failed. Is the API running?"
      );
    }
  }

  function speakLastAssistant() {
    const last = [...rows].reverse().find((r) => r.role === "assistant");
    if (!last) {
      Alert.alert("Read aloud", "No assistant reply yet.");
      return;
    }
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(last.content, {
      language: "en-US",
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <RNView style={styles.bannerRow}>
        <Text style={[styles.banner, { color: palette.muted }]}>
          Wellness Q and A — needs OPENAI_API_KEY on the server — not medical advice
        </Text>
      </RNView>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              {
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                backgroundColor:
                  item.role === "user"
                    ? palette.tint
                    : palette.card,
                maxWidth: "88%",
              },
            ]}
          >
            <Text
              style={{
                color: item.role === "user" ? "#fff" : palette.text,
                fontSize: 15,
                lineHeight: 21,
              }}
            >
              {item.content}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: palette.muted, textAlign: "center", marginTop: 24 }}>
            Ask about healthy habits, app features, or elder / fitness / nutrition tips.
          </Text>
        }
      />

      <RNView
        style={[
          styles.footer,
          { backgroundColor: palette.background, borderTopColor: "rgba(148,163,184,0.35)" },
        ]}
      >
        <Pressable
          onPress={speaking || busy ? undefined : speakLastAssistant}
          style={[styles.iconBtn, { opacity: busy && !speaking ? 0.5 : 1 }]}
        >
          <Text style={{ fontSize: 20 }}>{speaking ? "🔇" : "🔊"}</Text>
        </Pressable>

        {!recording ? (
          <Pressable
            onPress={busy ? undefined : startRecording}
            style={[styles.micBtn, { backgroundColor: palette.accent, opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={styles.micBtnText}>Mic</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={stopRecordingAndSend}
            style={[styles.micBtn, { backgroundColor: "#b91c1c" }]}
          >
            <Text style={styles.micBtnText}>Stop and send</Text>
          </Pressable>
        )}

        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={palette.muted}
          editable={!busy}
          multiline
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: "rgba(148,163,184,0.45)",
              backgroundColor: palette.card,
            },
          ]}
        />
        <Pressable
          onPress={sendFromText}
          disabled={busy || !input.trim()}
          style={[
            styles.sendBtn,
            { backgroundColor: palette.tint, opacity: busy || !input.trim() ? 0.45 : 1 },
          ]}
        >
          {busy && !recording ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Send</Text>
          )}
        </Pressable>
      </RNView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bannerRow: { paddingHorizontal: 12, paddingTop: 6 },
  banner: { fontSize: 11, textAlign: "center", lineHeight: 15 },
  listContent: { padding: 12, paddingBottom: 20, gap: 10 },
  bubble: { padding: 12, borderRadius: 14 },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
  },
  sendBtnText: { color: "#fff", fontWeight: "700" },
  micBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  micBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
