import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { api } from "@/src/api";
import { AppHeader, Screen, Card, Title, Body, KV, Empty, Loading, Pill } from "@/src/ui";
import { useTheme } from "@/src/theme";

export default function Bookings() {
  const { colors } = useTheme();
  const [items, setItems] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get("/admin/bookings")); } catch { setItems([]); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (items === null) return <><AppHeader title="Bookings" kicker="Discovery Calls" /><Loading /></>;

  return (
    <>
      <AppHeader title="Bookings" kicker="Discovery Calls" />
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        {items.length === 0 ? <Empty testID="bookings-empty" text="No bookings yet. Pull to refresh." /> : null}
        {items.map((b) => (
          <Card key={b.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <Title style={{ fontSize: 16 }}>{b.name || b.email || "Booking"}</Title>
              {b.status ? <Pill text={b.status} /> : null}
            </View>
            {b.email ? <Body style={{ fontSize: 13, color: colors.muted }}>{b.email}</Body> : null}
            {b.preferred_date || b.date ? <KV k="When" v={`${b.preferred_date || b.date || ""} ${b.preferred_time || b.time || ""}`.trim()} /> : null}
            {b.meeting_url ? <KV k="Meeting" v="Jitsi link ready" gold /> : null}
            {b.notes ? <Body style={{ fontSize: 13 }}>{b.notes}</Body> : null}
          </Card>
        ))}
      </Screen>
    </>
  );
}
