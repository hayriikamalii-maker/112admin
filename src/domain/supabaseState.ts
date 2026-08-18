import { createClient } from "@supabase/supabase-js";
import { migrateState } from "./storage";
import type { ActivityActionType, AppState, UserActivityLog } from "./types";

const remoteStateId = "main";
const authEmailDomain = "auth.11245911.com";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey && !supabaseKey.includes("buraya"));

const supabase = supabaseEnabled
  ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("tr-TR").replace(/[^a-z0-9._-]/g, "");
}

function usernameEmail(username: string) { return `${normalizeUsername(username)}@${authEmailDomain}`; }
function usernameFromEmail(email?: string) { return email?.endsWith(`@${authEmailDomain}`) ? email.slice(0, -(`@${authEmailDomain}`.length)) : ""; }
function requireSupabase() { if (!supabase) throw new Error("Supabase yapılandırması eksik."); return supabase; }

export async function signIn(username: string, password: string) {
  const client = requireSupabase();
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error("Kullanıcı adı geçersiz.");
  const { data, error } = await client.auth.signInWithPassword({ email: usernameEmail(normalized), password });
  if (error) throw error;
  return usernameFromEmail(data.user.email) || normalized;
}

export async function getAuthenticatedUsername() {
  if (!supabase) return "";
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? "" : usernameFromEmail(data.user.email);
}

export async function signOut() { if (supabase) { const { error } = await supabase.auth.signOut(); if (error) throw error; } }
export async function changePassword(password: string) { const { error } = await requireSupabase().auth.updateUser({ password }); if (error) throw error; }

export interface ActivityLogInput {
  username: string;
  actionType: ActivityActionType;
  actionLabel: string;
  route: string;
  target?: string;
  details?: Record<string, unknown>;
  deviceType?: string;
  deviceName?: string;
  operatingSystem?: string;
  browser?: string;
  userAgent?: string;
  screenSize?: string;
  sessionId?: string;
}

export async function logUserActivity(input: ActivityLogInput) {
  if (!supabase) return;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return;
  const { error } = await supabase.from("user_activity_logs").insert({
    user_id: authData.user.id,
    username: input.username,
    action_type: input.actionType,
    action_label: input.actionLabel.slice(0, 240),
    route: input.route,
    target: input.target?.slice(0, 240),
    details: input.details ?? {},
    device_type: input.deviceType,
    device_name: input.deviceName,
    operating_system: input.operatingSystem,
    browser: input.browser,
    user_agent: input.userAgent,
    screen_size: input.screenSize,
    session_id: input.sessionId,
  });
  if (error) throw error;
}

export async function loadUserActivityLogs(limit = 1000) {
  const { data, error } = await requireSupabase()
    .from("user_activity_logs")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 5000));
  if (error) throw error;
  return (data ?? []) as UserActivityLog[];
}

async function manageAuthUser(body: Record<string, unknown>) {
  const { data, error } = await requireSupabase().functions.invoke("admin-users", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function createAuthUser(username: string, password: string, role: "admin" | "user") { return manageAuthUser({ action: "create", username, password, role }); }
export async function resetAuthUserPassword(username: string, password: string) { return manageAuthUser({ action: "reset-password", username, password }); }
export async function updateAuthUserRole(username: string, role: "admin" | "user") { return manageAuthUser({ action: "update-role", username, role }); }

export async function loadRemoteState() {
  const { data, error } = await requireSupabase().from("app_state_snapshots").select("state").eq("id", remoteStateId).maybeSingle();
  if (error) throw error;
  const snapshot = data?.state as Partial<AppState> | undefined;
  if (!snapshot || Object.keys(snapshot).length === 0 || !snapshot.stations?.length || !snapshot.users?.length) return null;
  return migrateState(snapshot);
}

export async function saveRemoteState(state: AppState) {
  const cloudState: AppState = { ...state, users: state.users.map((user) => ({ ...user, password: "" })) };
  const { error } = await requireSupabase().from("app_state_snapshots").upsert({ id: remoteStateId, state: cloudState, updated_at: new Date().toISOString() });
  if (error) throw error;
}
