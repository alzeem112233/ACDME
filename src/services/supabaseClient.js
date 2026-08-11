import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let activeQzSessionToken = "";

export function toSafeHeaderValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code > 126) return "";
  }

  return text;
}

function createSupabaseClient(qzSessionToken = "") {
  const safeSessionToken = toSafeHeaderValue(qzSessionToken);
  return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: safeSessionToken ? { "x-qz-session": safeSessionToken } : {},
      },
    });
}

export let supabase = isSupabaseConfigured
  ? createSupabaseClient()
  : null;

export function getQzSessionToken() {
  return activeQzSessionToken;
}

export function setQzSessionToken(qzSessionToken = "") {
  if (!isSupabaseConfigured) return null;
  const nextToken = toSafeHeaderValue(qzSessionToken);
  if (activeQzSessionToken === nextToken && supabase) return supabase;
  activeQzSessionToken = nextToken;
  supabase = createSupabaseClient(activeQzSessionToken);
  return supabase;
}
