import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let activeQzSessionToken = "";

function clearLegacySupabaseAuthStorage() {
  if (typeof localStorage === "undefined" || !supabaseUrl) return;

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const legacyAuthKeys = [
      `sb-${projectRef}-auth-token`,
      `sb-${projectRef}-auth-token-code-verifier`,
    ];

    legacyAuthKeys.forEach((key) => {
      localStorage.removeItem(key);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore storage cleanup errors; the client can still run without persisted auth.
  }
}

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
  clearLegacySupabaseAuthStorage();
  const safeSessionToken = toSafeHeaderValue(qzSessionToken);
  return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
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
