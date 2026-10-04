import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
import { subjects } from "@/lib/data";
import { moodleClient, validateMoodleUrl } from "./client";
import { encryptionKey, encryptToken, decryptToken } from "./crypto";
import { MoodleError, type MoodleStatus } from "./types";
import { assertSameOrigin } from "./request";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new MoodleError("configuration", "El administrador debe completar la configuración de Aula Virtual.", 503);
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function configuration() {
  try {
    return { url: validateMoodleUrl(process.env.MOODLE_BASE_URL || ""), key: encryptionKey(process.env.MOODLE_TOKEN_ENCRYPTION_KEY || "") };
  } catch { throw new MoodleError("configuration", "El administrador debe completar la configuración segura de Aula Virtual.", 503); }
}

export async function authorizeMoodle(request: Request) {
  if (request.method !== "GET") assertSameOrigin(request);
  const client = await serverClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new MoodleError("unauthenticated", "Inicia sesión en SMR HUB para conectar Aula Virtual.", 401);
  return data.user.id;
}

export async function moodleStatus(userId: string): Promise<MoodleStatus> {
  const empty: MoodleStatus = { configured: false, connected: false, site_url: null, connected_at: null, checked_at: null, courses: [] };
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.MOODLE_BASE_URL || !process.env.MOODLE_TOKEN_ENCRYPTION_KEY) return empty;
  const { url } = configuration();
  const admin = adminClient();
  // No seleccionar el token en consultas de estado destinadas al navegador.
  const { data: connection, error } = await admin.from("moodle_connections").select("moodle_url,moodle_user_id,connected_at,checked_at").eq("user_id", userId).maybeSingle();
  if (error) throw new MoodleError("storage", "No se ha podido consultar Aula Virtual. Comprueba que se ha aplicado la migración de Fase A.", 503);
  if (!connection?.connected_at || connection.moodle_url !== url) return { ...empty, configured: true, site_url: url };
  const { data: courses, error: courseError } = await admin.from("moodle_course_mappings").select("course_id,fullname,shortname,subject,manual").eq("user_id", userId).order("fullname");
  if (courseError) throw new MoodleError("storage", "No se han podido cargar los cursos.", 503);
  return { configured: true, connected: true, site_url: url, connected_at: connection.connected_at, checked_at: connection.checked_at, courses: courses || [] };
}

export async function connectMoodle(userId: string, body: Record<string, unknown>) {
  const refresh = body.action === "refresh";
  if (!refresh && body.action !== "connect") throw new MoodleError("action", "Selecciona una operación válida.");
  const { url, key } = configuration();
  if (!refresh && (typeof body.username !== "string" || !body.username.trim() || body.username.length > 256 || typeof body.password !== "string" || !body.password || body.password.length > 1024))
    throw new MoodleError("credentials", "Introduce tu usuario y contraseña del Aula Virtual.");
  const admin = adminClient();
  const { data: allowed, error: rateError } = await admin.rpc("claim_moodle_attempt", { p_user_id: userId, p_moodle_url: url });
  if (rateError) throw new MoodleError("storage", "No se puede preparar la conexión. Comprueba la migración de Fase A.", 503);
  if (!allowed) throw new MoodleError("rate_limit", "Espera un minuto antes de volver a conectar o actualizar los cursos.", 429);
  const moodle = moodleClient(url);
  let token: string;
  let result: Awaited<ReturnType<typeof moodle.inspect>>;
  if (refresh) {
    const { data, error } = await admin.from("moodle_connections").select("token_ciphertext,moodle_url").eq("user_id", userId).single();
    if (error || !data?.token_ciphertext || data.moodle_url !== url) throw new MoodleError("not_connected", "Conecta primero tu cuenta del Aula Virtual.");
    try { token = decryptToken(data.token_ciphertext, userId, key); }
    catch { throw new MoodleError("decryption", "No se puede recuperar tu conexión. Vuelve a conectar Aula Virtual."); }
    result = await moodle.inspect(token);
  } else {
    const username = (body.username as string).trim();
    const password = body.password as string;
    // No guardar credenciales en el objeto de la petición tras leerlas.
    delete body.username; delete body.password;
    const connected = await moodle.connect(username, password);
    token = connected.token;
    result = connected;
  }
  const encrypted = encryptToken(token, userId, key);
  const { error } = await admin.rpc("save_moodle_connection", { p_user_id: userId, p_moodle_url: url, p_moodle_user_id: result.moodleUserId, p_token_ciphertext: encrypted, p_courses: result.courses });
  if (error) throw new MoodleError("storage", "Aula Virtual respondió, pero no se pudo guardar la conexión. Vuelve a intentarlo más tarde.", 503);
  return moodleStatus(userId);
}

export async function mapMoodleCourse(userId: string, body: Record<string, unknown>) {
  if (!Number.isSafeInteger(body.course_id) || Number(body.course_id) <= 0 || (body.subject !== null && (typeof body.subject !== "string" || !subjects.includes(body.subject))))
    throw new MoodleError("mapping", "Selecciona un curso y una de las seis asignaturas.");
  const { data, error } = await adminClient().from("moodle_course_mappings").update({ subject: body.subject, manual: true, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("course_id", body.course_id).select("course_id").maybeSingle();
  if (error) throw new MoodleError("storage", "No se ha podido guardar la asignatura.", 503);
  if (!data) throw new MoodleError("not_found", "Ese curso no pertenece a tu conexión.", 404);
  return moodleStatus(userId);
}

export async function disconnectMoodle(userId: string) {
  const { error } = await adminClient().from("moodle_connections").delete().eq("user_id", userId);
  if (error) throw new MoodleError("storage", "No se ha podido desconectar Aula Virtual.", 503);
  return moodleStatus(userId);
}
