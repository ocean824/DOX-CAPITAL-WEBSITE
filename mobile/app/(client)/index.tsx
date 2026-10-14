import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppHeader, Screen, Card, Title, Label, Body, KV, Pill, Empty, Loading } from "@/src/ui";
import { useTheme } from "@/src/theme";

export default function ClientOverview() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [deal, setDeal] = useState<any | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setDeal(await api.get("/prescreen/me")); setState("ready"); }
    catch { setState("none"); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (state === "loading") return <><AppHeader title="Overview" kicker="D.O.X Capital" /><Loading /></>;

  const score = deal?.score || {};
  const pct = score.required_total ? Math.round((score.received / score.required_total) * 100) : 0;

  return (
    <>
      <AppHeader title={`Welcome, ${(user?.name || "").split(" ")[0] || "there"}`} kicker="Your Deal" />
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Current phase</Label>
            <Pill text={deal?.phase_label || "Intake"} tone={deal?.phase === "approved" ? "success" : deal?.phase === "declined" ? "error" : deal?.ready ? "gold" : "muted"} />
          </View>
          <Title>{deal?.track_label || "Awaiting classification"}</Title>
          <Body>
            {deal?.track
              ? "Complete your document checklist to move your file toward the underwriting desk."
              : "Our team will classify your file and assign your document checklist shortly."}
          </Body>
        </Card>

        {deal?.track ? (
          <Card>
            <Label>Document readiness</Label>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text style={{ color: colors.gold, fontSize: 40, fontWeight: "300" }}>{pct}%</Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>ready</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.gold }} />
            </View>
            <KV k="Documents received" v={`${score.received ?? 0} / ${score.required_total ?? 0}`} />
            <KV k="Underwriter-ready" v={deal?.ready ? "Yes" : "Not yet"} gold={deal?.ready} />
          </Card>
        ) : null}

        <Card>
          <Label>Account</Label>
          <KV k="Name" v={user?.name || "—"} />
          <KV k="Email" v={user?.email || "—"} />
          <KV k="Status" v={user?.status || "approved"} />
        </Card>
      </Screen>
    </>
  );
}
