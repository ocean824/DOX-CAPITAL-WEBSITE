import { Redirect } from "expo-router";
import { useAuth, roleOf } from "@/src/auth";
import { Loading } from "@/src/ui";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (user.status === "pending" || user.status === "rejected") return <Redirect href="/pending" />;
  const r = roleOf(user);
  if (r === "admin") return <Redirect href="/(admin)" />;
  if (r === "underwriter") return <Redirect href="/(underwriter)" />;
  return <Redirect href="/(client)" />;
}
