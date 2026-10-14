import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, roleOf } from "@/src/auth";
import { Field, Button } from "@/src/ui";
import { useTheme } from "@/src/theme";

export default function Login() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email || !password) { setError("Enter your email and password."); return; }
    setBusy(true); setError("");
    try {
      const u = await login(email, password);
      if (u.status === "pending" || u.status === "rejected") { router.replace("/pending"); return; }
      const r = roleOf(u);
      router.replace(r === "admin" ? "/(admin)" : r === "underwriter" ? "/(underwriter)" : "/(client)");
    } catch (e: any) {
      setError(e.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 28, paddingTop: insets.top + 40 }}>
        <Text style={{ color: colors.onSurface, fontSize: 34, fontWeight: "300", letterSpacing: 6 }}>D.O.X</Text>
        <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 5, textTransform: "uppercase", marginTop: 6 }}>Capital</Text>
        <Text style={{ color: colors.onSurfaceTertiary, fontSize: 15, marginTop: 28, lineHeight: 22 }}>
          Sign in to your partner portal.
        </Text>

        <View style={{ gap: 16, marginTop: 28 }}>
          <Field testID="login-email-input" label="Email" value={email} onChangeText={setEmail}
            placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" />
          <Field testID="login-password-input" label="Password" value={password} onChangeText={setPassword}
            placeholder="••••••••" secureTextEntry autoCapitalize="none" />
          {error ? <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}
          <Button testID="login-submit-button" title="Sign In" onPress={submit} loading={busy} />
        </View>

        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 28, lineHeight: 19 }}>
          New to D.O.X? Request access on thedoxs.com — accounts are approved by our team before portal access.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
