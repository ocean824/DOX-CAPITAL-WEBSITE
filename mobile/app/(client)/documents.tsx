import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, uploadFile } from "@/src/api";
import { AppHeader, Screen, Card, Title, Body, Button, Empty, Loading, Pill } from "@/src/ui";
import { useTheme } from "@/src/theme";
import { FileText } from "lucide-react-native";

export default function Documents() {
  const { colors } = useTheme();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try { setDocs(await api.get("/uploads/mine")); } catch { setDocs([]); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setUploading(true); setMsg("");
    try {
      await uploadFile({ uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" });
      setMsg(`Uploaded ${a.name}`);
      await load();
    } catch (e: any) {
      setMsg(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const fmtSize = (n?: number) => n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : "—";

  return (
    <>
      <AppHeader title="Documents" kicker="Upload & Review" />
      {docs === null ? <Loading /> : (
        <Screen refreshing={refreshing} onRefresh={onRefresh}>
          <Button testID="upload-button" title={uploading ? "Uploading…" : "Upload a document"} onPress={pick} loading={uploading} />
          {msg ? <Text style={{ color: colors.muted, fontSize: 12 }}>{msg}</Text> : null}
          {docs.length === 0 ? <Empty testID="documents-empty" text="No documents uploaded yet. Tap upload to add diligence files (PDF, images, up to 200MB)." /> : null}
          {docs.map((d) => (
            <Card key={d.id}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <FileText color={colors.onSurfaceTertiary} size={22} strokeWidth={1.25} />
                <View style={{ flex: 1 }}>
                  <Title style={{ fontSize: 15 }} >{d.original_filename || "Document"}</Title>
                  <Body style={{ fontSize: 12, color: colors.muted }}>{fmtSize(d.size)} · {new Date(d.created_at).toLocaleDateString()}</Body>
                </View>
                <Pill text={(d.category || "general").split(":")[0]} />
              </View>
            </Card>
          ))}
        </Screen>
      )}
    </>
  );
}
