import React from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "./theme";

export function AppHeader({ title, kicker, right }: { title: string; kicker?: string; right?: React.ReactNode }) {
  const s = useHeader();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={s.kicker}>{kicker}</Text> : null}
        <Text style={s.title} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Screen({ children, scroll = true, refreshing, onRefresh }:
  { children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: colors.surface }}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 110, gap: 16 }}
      refreshControl={onRefresh && Platform.OS !== "web" ? (
        <RNRefresh refreshing={!!refreshing} onRefresh={onRefresh} tint={colors.onSurface} />
      ) : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

// small wrapper so we don't import RefreshControl everywhere
import { RefreshControl } from "react-native";
function RNRefresh({ refreshing, onRefresh, tint }: any) {
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} colors={[tint]} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const s = useCard();
  return <View style={[s.card, style]}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const s = useCard();
  return <Text style={s.label}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: any }) {
  const s = useCard();
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: any }) {
  const s = useCard();
  return <Text style={[s.body, style]}>{children}</Text>;
}

export function Pill({ text, tone = "muted" }: { text: string; tone?: "muted" | "success" | "warning" | "error" | "info" | "gold" }) {
  const { colors } = useTheme();
  const map: Record<string, string> = {
    muted: colors.muted, success: colors.success, warning: colors.warning,
    error: colors.error, info: colors.info, gold: colors.gold,
  };
  const c = map[tone] || colors.muted;
  return (
    <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: c, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2 }}>
      <Text style={{ color: c, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", disabled, testID, loading }:
  { title: string; onPress: () => void; variant?: "primary" | "ghost" | "danger"; disabled?: boolean; testID?: string; loading?: boolean }) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.brandPrimary : "transparent";
  const fg = variant === "primary" ? colors.onBrandPrimary : variant === "danger" ? colors.error : colors.onSurface;
  const border = variant === "primary" ? colors.brandPrimary : variant === "danger" ? colors.error : colors.border;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 2,
        height: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 18,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1, flexDirection: "row", gap: 8,
      })}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : <Text style={{ color: fg, fontSize: 14, fontWeight: "600", letterSpacing: 0.5 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, testID, multiline }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={{ color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          color: colors.onSurface, backgroundColor: colors.surfaceTertiary,
          borderWidth: 1, borderColor: colors.border, borderRadius: 2,
          paddingHorizontal: 14, paddingVertical: 14, fontSize: 15,
          minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export function KV({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: gold ? colors.gold : colors.onSurface, fontSize: 14, fontWeight: "600" }}>{v}</Text>
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.onSurface} /></View>;
}

export function Empty({ text, testID }: { text: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 2, padding: 28, alignItems: "center" }}>
      <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>{text}</Text>
    </View>
  );
}

const useHeader = makeStyles((c) => ({
  wrap: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  kicker: { color: c.muted, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "300", letterSpacing: -0.5 },
}));

const useCard = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 2, padding: 18, gap: 10 },
  label: { color: c.muted, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" },
  title: { color: c.onSurface, fontSize: 18, fontWeight: "500", letterSpacing: -0.3 },
  body: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },
}));
