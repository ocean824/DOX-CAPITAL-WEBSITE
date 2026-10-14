import { Tabs } from "expo-router";
import { UserCheck, Briefcase, CalendarDays, Sparkles, User } from "lucide-react-native";
import { useTheme } from "@/src/theme";

export default function AdminLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.onSurface,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1 },
      tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.5 },
      sceneStyle: { backgroundColor: colors.surface },
    }}>
      <Tabs.Screen name="index" options={{ title: "Approvals", tabBarIcon: ({ color }) => <UserCheck color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="deals" options={{ title: "Deals", tabBarIcon: ({ color }) => <Briefcase color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: ({ color }) => <CalendarDays color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarIcon: ({ color }) => <Sparkles color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Account", tabBarIcon: ({ color }) => <User color={color} size={20} strokeWidth={1.5} /> }} />
    </Tabs>
  );
}
