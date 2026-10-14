import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Button } from "@/src/ui";
import { useTheme } from "@/src/theme";
import { Clock } from "lucide-react-native";

export default function Pending() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const rejected = user?.status === "rejected";

  const doLogout = async () => { await logout(); router.replace("/login"); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, padding: 28, paddingTop: insets.top + 60, gap: 18 }}>
      <View style={{ width: 52, height: 52, borderRadius: 2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
        <Clock color={colors.gold} size={24} strokeWidth={1.25} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>
        {rejected ? "Access declined" : "Awaiting approval"}
      </Text>
      <Text style={{ color: colors.onSurface, fontSize: 28, fontWeight: "300", letterSpacing: -0.5 }}>
        {rejected ? "Your request wasn't approved." : "Your spot is reserved."}
      </Text>
      <Text style={{ color: colors.onSurfaceTertiary, fontSize: 15, lineHeight: 23 }}>
        {rejected
          ? "Our team reviewed your request and could not approve portal access at this time. Reach out to admin@thedoxs.com with any questions."
          : "Our team reviews every applicant manually. You'll get an email the moment your account is approved — then sign in again here."}
      </Text>
      <View style={{ marginTop: 10 }}>
        <Button testID="pending-logout" title="Sign out" variant="ghost" onPress={doLogout} />
      </View>
    </View>
  );
}
