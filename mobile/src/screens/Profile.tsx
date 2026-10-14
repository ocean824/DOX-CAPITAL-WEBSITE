import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth, roleOf } from "@/src/auth";
import { AppHeader, Screen, Card, Title, Label, KV, Button, Pill } from "@/src/ui";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator", underwriter: "Underwriter", partner: "Partner", client: "Client",
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (!user) return null;
  const status = (user.status || "approved") as string;
  const tone = status === "approved" ? "success" : status === "pending" ? "warning" : "error";

  return (
    <>
      <AppHeader title="Account" kicker="D.O.X Capital" />
      <Screen>
        <Card>
          <Label>Signed in as</Label>
          <Title>{user.name || user.email}</Title>
          <KV k="Email" v={user.email} />
          <KV k="Role" v={ROLE_LABEL[roleOf(user)]} />
          {user.company ? <KV k="Company" v={user.company} /> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
            <Label>Status</Label>
            <Pill text={status} tone={tone as any} />
          </View>
          {user.referral_code ? <KV k="Referral code" v={user.referral_code} gold /> : null}
          {user.business_email ? <KV k="Business email" v={user.business_email} /> : null}
        </Card>
        <Button testID="logout-button" title="Sign out" variant="ghost" onPress={doLogout} />
      </Screen>
    </>
  );
}
