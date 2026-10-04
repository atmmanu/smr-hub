import "server-only";
import { serverClient } from "@/lib/supabase/server";
import { adminClient, configuration, moodleStatus } from "./server";
import { decryptToken } from "./crypto";
import { moodleClient } from "./client";
import { collectAcademicEvents } from "./sync";
import { persistSnapshot } from "./persistence";
import { MoodleError } from "./types";
import type { AcademicFeed } from "./academic-types";
import { randomUUID } from "node:crypto";

export async function syncMoodle(userId: string, mode: "manual" | "automatic" = "manual") {
 const admin = adminClient(); const lease = randomUUID();
 const {data:claimed,error:lockError}=await admin.rpc("claim_moodle_sync_lock",{p_user:userId,p_lease:lease});
 // Keep the validated manual flow available while D is being reviewed, before its migration is applied.
 if(lockError && mode==="manual" && ["PGRST202","42883"].includes(lockError.code))return performMoodleSync(userId);
 if(lockError)throw new MoodleError("storage","Comprueba la migración de Fase D para sincronizar.",503);
 if(!claimed)throw new MoodleError("sync_busy","Ya se está sincronizando tu cuenta. Espera un momento.",409);
 let runId:string|undefined;
 try {
  const {data:run,error}=await admin.from("moodle_sync_runs").insert({user_id:userId,mode}).select("id").single();
  if(error)throw new MoodleError("storage","No se puede registrar la sincronización.",503);
  runId=run.id;
  const summary=await performMoodleSync(userId);
  const {error:finished}=await admin.from("moodle_sync_runs").update({finished_at:new Date().toISOString(),result:"success",new_events:summary.tasks+summary.resources,updates:summary.updates}).eq("id",runId);
  if(finished)throw new MoodleError("storage","El contenido se guardó, pero no se pudo registrar el resultado.",503);
  return summary;
 } catch(error) {
  if(runId)await admin.from("moodle_sync_runs").update({finished_at:new Date().toISOString(),result:error instanceof MoodleError && error.code==="rate_limit"?"skipped":"failed",error_code:error instanceof MoodleError?error.code:"sync_failed"}).eq("id",runId);
  throw error;
 } finally { await admin.rpc("release_moodle_sync_lock",{p_user:userId,p_lease:lease}); }
}
async function performMoodleSync(userId: string) {
 const { url, key } = configuration(); const admin = adminClient();
 const { data: connection, error } = await admin.from("moodle_connections").select("moodle_url,moodle_user_id,token_ciphertext").eq("user_id", userId).maybeSingle();
 if (error || !connection?.token_ciphertext || connection.moodle_url !== url) throw new MoodleError("not_connected", "Conecta primero Aula Virtual.");
 const { data: allowed, error: rateError } = await admin.rpc("claim_moodle_attempt", { p_user_id: userId, p_moodle_url: url });
 if (rateError) throw new MoodleError("storage", "No se puede preparar la sincronización.", 503);
 if (!allowed) throw new MoodleError("rate_limit", "Espera un minuto entre conexiones, consultas de cursos o sincronizaciones.", 429);
 let token: string;
 try { token = decryptToken(connection.token_ciphertext, userId, key); }
 catch { throw new MoodleError("decryption", "Vuelve a conectar Aula Virtual para recuperar la conexión."); }
 const deadline = AbortSignal.timeout(50_000);
 const client = moodleClient(url, (input, init) => fetch(input, { ...init, signal: AbortSignal.any([deadline, init?.signal || new AbortController().signal]) }));
 const inspected = await client.inspect(token);
 if (inspected.moodleUserId !== connection.moodle_user_id) throw new MoodleError("account", "La cuenta del Aula Virtual ha cambiado. Vuelve a conectar.");
 if (!["mod_assign_get_assignments", "core_course_get_contents"].every(name => inspected.functions.includes(name))) throw new MoodleError("academic_access", "El centro no permite consultar tareas y contenidos mediante la app de Moodle.");
 // Refresh enrolments through the existing function, preserving all manual mappings.
 const { error: saved } = await admin.rpc("refresh_moodle_sync_courses", { p_user_id: userId, p_site: url, p_moodle_user_id: inspected.moodleUserId, p_token_ciphertext: connection.token_ciphertext, p_courses: inspected.courses });
 if (saved) throw new MoodleError("storage", "No se han podido actualizar los cursos.", 503);
 const status = await moodleStatus(userId);
 const events = await collectAcademicEvents(client, token, url, status.courses);
 deadline.throwIfAborted();
 return persistSnapshot(userId, url, inspected.moodleUserId, connection.token_ciphertext, status.courses, events);
}

export async function academicFeed(userId: string): Promise<AcademicFeed> {
 const status = await moodleStatus(userId);
 if (!status.connected) return { last_synced_at: null, summary: null, events: [], notifications: [] };
 const client = await serverClient();
 const [sync, events, notifications] = await Promise.all([
  adminClient().from("moodle_sync_status").select("last_synced_at,summary,moodle_site,moodle_user_id").eq("user_id", userId).maybeSingle(),
  client.from("common_events").select("id,external_course_id,title,description,event_type,external_url,user_event_state!inner(read,completed,hidden,favourite,personal_notes,effective_due_date,effective_open_date)").eq("user_event_state.user_id", userId).order("updated_at", { ascending: false }).limit(100),
  client.from("notifications").select("id,type,title,message,read,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
 ]);
 if (sync.error || events.error || notifications.error) throw new MoodleError("storage", "No se puede cargar el contenido. Comprueba que se ha aplicado la migración de Fase B.", 503);
 const { data: connection } = await adminClient().from("moodle_connections").select("moodle_user_id").eq("user_id", userId).maybeSingle();
 const validSync = sync.data?.moodle_site === status.site_url && sync.data?.moodle_user_id === connection?.moodle_user_id;
 return { last_synced_at: validSync ? sync.data?.last_synced_at : null, summary: validSync ? sync.data?.summary : null,
  events: (events.data || []).map(event => { const personal = event.user_event_state[0]; return { id: event.id, title: event.title, description: event.description, event_type: event.event_type, external_url: event.external_url, subject: status.courses.find(c => c.course_id === event.external_course_id)?.subject || "", due_date: personal.effective_due_date, open_date: personal.effective_open_date, read: personal.read, completed: personal.completed, hidden: personal.hidden, favourite: personal.favourite, personal_notes: personal.personal_notes }; }),
  notifications: notifications.data || [] };
}

export async function updatePersonal(userId: string, body: Record<string, unknown>) {
 if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw new MoodleError("id", "Selecciona un elemento válido.");
 const client = await serverClient();
 if (body.kind === "notification") {
  if (typeof body.read !== "boolean") throw new MoodleError("state", "Selecciona un estado válido.");
  const { data, error } = await client.from("notifications").update({ read: body.read }).eq("id", body.id).eq("user_id", userId).select("id").maybeSingle();
  if (error || !data) throw new MoodleError("state", "No se ha podido actualizar el aviso.");
 } else if (body.kind === "event") {
  const fields: Record<string, unknown> = {};
  for (const field of ["read", "completed", "hidden", "favourite"]) if (body[field] !== undefined) { if (typeof body[field] !== "boolean") throw new MoodleError("state", "Selecciona un estado válido."); fields[field] = body[field]; }
  if (body.personal_notes !== undefined) { if (typeof body.personal_notes !== "string" || body.personal_notes.length > 4000) throw new MoodleError("notes", "Las notas deben tener como máximo 4000 caracteres."); fields.personal_notes = body.personal_notes; }
  if (!Object.keys(fields).length) throw new MoodleError("state", "Selecciona un estado para modificar.");
  const { data, error } = await client.from("user_event_state").update(fields).eq("common_event_id", body.id).eq("user_id", userId).select("common_event_id").maybeSingle();
  if (error || !data) throw new MoodleError("state", "No se ha podido actualizar tu estado.");
 } else throw new MoodleError("state", "Selecciona un elemento válido.");
 return academicFeed(userId);
}
