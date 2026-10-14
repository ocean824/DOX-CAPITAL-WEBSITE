import React, { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppHeader, Field, Button, Empty, Loading } from "@/src/ui";
import { useTheme } from "@/src/theme";

export default function Messages() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [thread, setThread] = useState<any[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try { setThread(await api.get(`/deals/${user.id}/messages`)); }
    catch { setThread([]); }
  }, [user]);
  React.useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = input.trim();
    if (!body || busy) return;
    setInput(""); setBusy(true);
    try { await api.post(`/deals/${user.id}/messages`, { body }); await load(); }
    catch { /* noop */ }
    finally { setBusy(false); setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80); }
  };

  return (
    <>
      <AppHeader title="Messages" kicker="Your D.O.X Team" />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        {thread === null ? <Loading /> : (
          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }}>
            {thread.length === 0 ? <Empty text="No messages yet. Send a note and your D.O.X team will reply here." /> : null}
            {thread.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                  {!mine ? <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 3, letterSpacing: 1 }}>{m.sender_name || "D.O.X"}</Text> : null}
                  <View style={{
                    backgroundColor: mine ? colors.brandPrimary : colors.surfaceSecondary,
                    borderWidth: 1, borderColor: mine ? colors.brandPrimary : colors.border,
                    borderRadius: 2, paddingHorizontal: 14, paddingVertical: 10,
                  }}>
                    <Text style={{ color: mine ? colors.onBrandPrimary : colors.onSurface, fontSize: 14, lineHeight: 21 }}>{m.body}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field testID="message-input" value={input} onChangeText={setInput} placeholder="Message your team" multiline />
          </View>
          <View style={{ width: 90 }}>
            <Button testID="message-send" title="Send" onPress={send} loading={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
