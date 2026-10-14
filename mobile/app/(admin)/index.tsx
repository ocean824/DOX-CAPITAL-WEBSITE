import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { api } from "@/src/api";
import { AppHeader, Screen, Card, Title, Body, Button, Empty, Loading, Pill } from "@/src/ui";
import { useTheme } from "@/src/theme";

export default function Approvals() {
  const { colors } = useTheme();
  const [users, setUsers] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await api.get("/admin/users?status=pending")); } catch { setUsers([]); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const act = async (id: string, action: "approve" | "reject") => {
    setActingId(id);
    try { await api.post(`/admin/users/${id}/${action}`); await load(); }
    catch { /* noop */ }
    finally { setActingId(null); }
  };

  if (users === null) return <><AppHeader title="Approvals" kicker="Access Requests" /><Loading /></>;

  return (
    <>
      <AppHeader title="Approvals" kicker="Access Requests" />
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        {users.length === 0 ? <Empty testID="approvals-empty" text="No pending access requests. Pull to refresh." /> : null}
        {users.map((u) => (
          <Card key={u.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Title>{u.name || u.email}</Title>
                <Body style={{ fontSize: 13, color: colors.muted }}>{u.email}</Body>
              </View>
              <Pill text={u.account_type || "client"} tone="gold" />
            </View>
            {u.company ? <Body style={{ fontSize: 13 }}>{u.company}</Body> : null}
            {u.message ? <Body style={{ fontSize: 13 }}>&ldquo;{u.message}&rdquo;</Body> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Button testID={`approve-${u.id}`} title="Approve" loading={actingId === u.id} onPress={() => act(u.id, "approve")} /></View>
              <View style={{ flex: 1 }}><Button testID={`reject-${u.id}`} title="Reject" variant="danger" loading={actingId === u.id} onPress={() => act(u.id, "reject")} /></View>
            </View>
          </Card>
        ))}
      </Screen>
    </>
  );
}
