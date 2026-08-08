import { createClient } from "@supabase/supabase-js";
import { migrateState } from "./storage";
import type { AppState } from "./types";

const remoteStateId = "main";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey && !supabaseAnonKey.includes("buraya"));

const supabase = supabaseEnabled ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export async function loadRemoteState() {
  if (!supabase) return null;
  const { data, error } = await supabase.from("app_state_snapshots").select("state").eq("id", remoteStateId).maybeSingle();
  if (error) throw error;
  const snapshot = data?.state as Partial<AppState> | undefined;
  if (!snapshot || Object.keys(snapshot).length === 0 || !snapshot.stations?.length || !snapshot.users?.length) return null;
  return migrateState(snapshot);
}

export async function saveRemoteState(state: AppState) {
  if (!supabase) return;
  const { error } = await supabase.from("app_state_snapshots").upsert({
    id: remoteStateId,
    state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
