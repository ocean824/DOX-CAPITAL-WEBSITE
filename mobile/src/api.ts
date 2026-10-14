// Thin fetch client for the D.O.X backend. Bearer token from secure storage.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "dox_access_token";

async function authHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Opts = { method?: string; body?: any; headers?: Record<string, string> };

export async function apiFetch(path: string, opts: Opts = {}): Promise<any> {
  const { method = "GET", body, headers } = opts;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()), ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export async function uploadFile(file: { uri: string; name: string; type: string }, category = "general") {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
  form.append("category", category);
  const res = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    headers: { ...(await authHeader()) },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.detail) || "Upload failed");
  return data;
}

export const api = {
  get: (p: string) => apiFetch(p),
  post: (p: string, body?: any) => apiFetch(p, { method: "POST", body }),
  put: (p: string, body?: any) => apiFetch(p, { method: "PUT", body }),
  del: (p: string) => apiFetch(p, { method: "DELETE" }),
};
