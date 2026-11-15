import { createClient } from "@supabase/supabase-js";

const canonicalSupabaseUrl = "https://vfvsexrikwokuenopwmi.supabase.co";
const canonicalSupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdnNleHJpa3dva3Vlbm9wd21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3Mzg2NjYsImV4cCI6MjA5OTMxNDY2Nn0.H2i2yGdEl_WLu2Gu1wKcSbmO4xFRzJZLpZ21K7zlqHM";
const configuredSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const configuredSupabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const shouldUseCanonicalProject = !configuredSupabaseUrl || configuredSupabaseUrl.includes("xxnizgstlkmjfrzfqfvh");

export const supabaseUrl = shouldUseCanonicalProject ? canonicalSupabaseUrl : configuredSupabaseUrl;
export const supabaseAnonKey = shouldUseCanonicalProject || !configuredSupabaseAnonKey
  ? canonicalSupabaseAnonKey
  : configuredSupabaseAnonKey;

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
