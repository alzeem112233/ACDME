import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createSupabaseClient(qzSessionToken = "") {
  return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: qzSessionToken ? { "x-qz-session": qzSessionToken } : {},
      },
    });
}

export let supabase = isSupabaseConfigured
  ? createSupabaseClient()
  : null;

export function setQzSessionToken(qzSessionToken = "") {
  if (!isSupabaseConfigured) return null;
  supabase = createSupabaseClient(qzSessionToken);
  return supabase;
}
