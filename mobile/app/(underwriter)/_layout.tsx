import { Tabs } from "expo-router";
import { Briefcase, Sparkles, User } from "lucide-react-native";
import { useTheme } from "@/src/theme";

export default function UnderwriterLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Deals", tabBarIcon: ({ color }) => <Briefcase color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarIcon: ({ color }) => <Sparkles color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Account", tabBarIcon: ({ color }) => <User color={color} size={20} strokeWidth={1.5} /> }} />
    </Tabs>
  );
}
