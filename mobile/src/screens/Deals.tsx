import React, { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { api } from "@/src/api";
import { AppHeader, Screen, Card, Title, Body, Pill, Button, Empty, Loading } from "@/src/ui";
import { useTheme } from "@/src/theme";

const PHASE_TONE: Record<string, any> = {
  "Approved": "success", "Declined": "error", "In Underwriting": "info",
  "Ready to Underwrite": "gold", "In Preparation": "warning", "Intake": "muted",
};

export default function DealsScreen({ title, kicker, endpoint }: { title: string; kicker: string; endpoint: string }) {
  const { colors } = useTheme();
  const [deals, setDeals] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try { setDeals(await api.get(endpoint)); }
    catch { setDeals([]); }
  }, [endpoint]);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const setPhase = async (clientId: string, phase: string) => {
    setActing(true);
    try { await api.put(`/underwriter/deals/${clientId}/phase`, { phase }); await load(); setOpenId(null); }
    catch (e: any) { /* surfaced via reload */ }
    finally { setActing(false); }
  };

  if (deals === null) return <><AppHeader title={title} kicker={kicker} /><Loading /></>;

  return (
    <>
      <AppHeader title={title} kicker={kicker} />
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        {deals.length === 0 ? <Empty testID="deals-empty" text="No deals in this queue yet. Pull to refresh." /> : null}
        {deals.map((d) => {
          const u = d.user || {};
          const id = u.id;
          const score = d.score || {};
          const open = openId === id;
          return (
            <Card key={id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Title>{u.name || u.email}</Title>
                  {u.company ? <Body style={{ color: colors.muted }}>{u.company}</Body> : null}
                </View>
                <Pill text={d.phase_label || "—"} tone={PHASE_TONE[d.phase_label] || "muted"} />
              </View>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 2 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Track: <Text style={{ color: colors.onSurface }}>{d.track_label || "Unassigned"}</Text></Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Docs: <Text style={{ color: colors.onSurface }}>{score.received ?? 0}/{score.required_total ?? 0}</Text></Text>
                {d.ready ? <Text style={{ color: colors.gold, fontSize: 12 }}>Ready</Text> : null}
              </View>
              <Pressable testID={`deal-toggle-${id}`} onPress={() => setOpenId(open ? null : id)} style={{ marginTop: 6 }}>
                <Text style={{ color: colors.onSurfaceTertiary, fontSize: 13, textDecorationLine: "underline" }}>{open ? "Hide actions" : "Change phase"}</Text>
              </Pressable>
              {open ? (
                <View style={{ gap: 10, marginTop: 6 }}>
                  <Button testID={`deal-underwrite-${id}`} title="Move to In Underwriting" variant="ghost" loading={acting} onPress={() => setPhase(id, "in_underwriting")} />
                  <Button testID={`deal-approve-${id}`} title="Approve deal" loading={acting} onPress={() => setPhase(id, "approved")} />
                  <Button testID={`deal-decline-${id}`} title="Decline deal" variant="danger" loading={acting} onPress={() => setPhase(id, "declined")} />
                </View>
              ) : null}
            </Card>
          );
        })}
      </Screen>
    </>
  );
}
