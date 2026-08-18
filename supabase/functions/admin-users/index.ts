import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.0";

const cors = {
  "Access-Control-Allow-Origin": "https://11245911.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const roles = ["admin", "station_manager", "ysp_manager", "driver_manager"] as const;
type AppRole = typeof roles[number];
const readRole = (value: unknown): AppRole => roles.includes(value as AppRole) ? value as AppRole : "station_manager";
const readStationIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].slice(0, 100) : [];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);
  const { data: caller } = await service.from("app_members").select("role, active").eq("user_id", authData.user.id).maybeSingle();
  if (!caller?.active || caller.role !== "admin") return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const username = normalize(body.username);
  if (!username) return json({ error: "invalid username" }, 400);
  const email = username + "@auth.11245911.com";
  const role = readRole(body.role);
  const stationIds = readStationIds(body.stationIds);

  if (action === "create") {
    const password = String(body.password ?? "");
    if (password.length < 6) return json({ error: "password too short" }, 400);
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username }, app_metadata: { app_role: role } });
    if (error || !data.user) return json({ error: error?.message ?? "user creation failed" }, 400);
    const { error: memberError } = await service.from("app_members").upsert({ user_id: data.user.id, username, role, station_ids: stationIds, active: true, updated_at: new Date().toISOString() });
    if (memberError) { await service.auth.admin.deleteUser(data.user.id); return json({ error: memberError.message }, 400); }
    return json({ ok: true, user_id: data.user.id });
  }

  const { data: member } = await service.from("app_members").select("user_id, role, station_ids").eq("username", username).maybeSingle();
  if (action === "reset-password") {
    const password = String(body.password ?? "");
    if (password.length < 6) return json({ error: "password too short" }, 400);
    if (!member) return json({ error: "user not found" }, 404);
    const { error } = await service.auth.admin.updateUserById(member.user_id, { password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  if (!member) return json({ error: "user not found" }, 404);
  if (action === "update-role") {
    const { error: memberError } = await service.from("app_members").update({ role, station_ids: stationIds, updated_at: new Date().toISOString() }).eq("user_id", member.user_id);
    const { error: authError } = await service.auth.admin.updateUserById(member.user_id, { app_metadata: { app_role: role } });
    if (memberError || authError) return json({ error: memberError?.message ?? authError?.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
});
