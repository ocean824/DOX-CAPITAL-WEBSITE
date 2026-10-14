import React, { useRef, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { AppHeader, Field, Button, Empty } from "@/src/ui";
import { useTheme } from "@/src/theme";

type Msg = { role: "user" | "assistant"; text: string };

export default function AssistantScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useRef<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await api.post("/assistant/chat", { message: text, session_id: sessionId.current });
      sessionId.current = res.session_id;
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", text: `⚠︎ ${e.message || "The assistant is unavailable."}` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <>
      <AppHeader title="Assistant" kicker="D.O.X Intelligence" />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }}>
          {messages.length === 0 ? (
            <Empty text="Ask about deal readiness, the pre-screening checklist, or what a client must prepare." />
          ) : null}
          {messages.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              <View style={{
                backgroundColor: m.role === "user" ? colors.brandPrimary : colors.surfaceSecondary,
                borderWidth: 1, borderColor: m.role === "user" ? colors.brandPrimary : colors.border,
                borderRadius: 2, paddingHorizontal: 14, paddingVertical: 10,
              }}>
                <Text style={{ color: m.role === "user" ? colors.onBrandPrimary : colors.onSurface, fontSize: 14, lineHeight: 21 }}>{m.text}</Text>
              </View>
            </View>
          ))}
          {busy ? <Text style={{ color: colors.muted, fontSize: 12 }}>Thinking…</Text> : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field testID="assistant-input" value={input} onChangeText={setInput} placeholder="Message the assistant" multiline />
          </View>
          <View style={{ width: 96 }}>
            <Button testID="assistant-send" title="Send" onPress={send} loading={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
