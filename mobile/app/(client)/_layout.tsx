import { Tabs } from "expo-router";
import { LayoutGrid, FileText, MessageSquare, User } from "lucide-react-native";
import { useTheme } from "@/src/theme";

export default function ClientLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Overview", tabBarIcon: ({ color }) => <LayoutGrid color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="documents" options={{ title: "Documents", tabBarIcon: ({ color }) => <FileText color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color }) => <MessageSquare color={color} size={20} strokeWidth={1.5} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Account", tabBarIcon: ({ color }) => <User color={color} size={20} strokeWidth={1.5} /> }} />
    </Tabs>
  );
}
