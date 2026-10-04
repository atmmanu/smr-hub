import "server-only";
import { serverClient } from "./supabase/server";
import { MoodleError } from "./moodle/types";
import { uuidPattern } from "./dashboard-server";
import type { NotificationData } from "./notifications";
import { moodleStatus } from "./moodle/server";
export async function listNotifications(userId: string): Promise<NotificationData> {
 const client = await serverClient();
 let recent = await client.from("notifications").select("id,type,title,message,read,created_at,calendar_source,calendar_event_id,common_events(id,subject,external_course_id)").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
 // Keep B/C usable while the additive D migration is awaiting installation.
 if (recent.error?.code === "42703" || recent.error?.code === "PGRST204") recent = await client.from("notifications").select("id,type,title,message,read,created_at,common_events(id,subject,external_course_id)").eq("user_id", userId).order("created_at", { ascending: false }).limit(30) as typeof recent;
 const [count, status] = await Promise.all([
  client.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("read", false),
  moodleStatus(userId),
 ]);
 if (recent.error || count.error) throw new MoodleError("storage", "No se han podido cargar tus notificaciones.", 503);
 const ids = (recent.data || []).map(row=>row.calendar_event_id).filter(Boolean);
 const [general,personal] = ids.length ? await Promise.all([
  client.from("class_calendar_events").select("id,subject").in("id",ids),
  client.from("personal_calendar_events").select("id,subject").eq("user_id",userId).in("id",ids),
 ]) : [{data:[],error:null},{data:[],error:null}];
 if (general.error || personal.error) throw new MoodleError("storage", "No se han podido cargar tus notificaciones.",503);
 return { unread_count: count.count || 0, items: (recent.data || []).map(row => {
  const linked = row.common_events as unknown as { id: string; subject: string; external_course_id:number } | null;
  const local = (row.calendar_source === "general" ? general.data : row.calendar_source === "personal" ? personal.data : [])?.find(e=>e.id===row.calendar_event_id);
  if (local) return {id:row.id,type:row.type,title:row.title,message:row.message,read:row.read,created_at:row.created_at,subject:local.subject,event_id:local.id,href:`/dashboard/calendario?source=${row.calendar_source}&event=${local.id}`};
  return { id: row.id, type: row.type, title: row.title, message: row.message, read: row.read, created_at: row.created_at, subject: linked ? status.courses.find(c=>c.course_id===linked.external_course_id)?.subject || linked.subject : null, event_id: linked?.id || null, href: linked ? `/dashboard/calendario?source=moodle&event=${linked.id}` : null };
 }) };
}
export async function readNotifications(userId: string, id?: string, read = true) {
 if (id && !uuidPattern.test(id)) throw new MoodleError("id", "Selecciona una notificación válida.");
 const client = await serverClient(); let query = client.from("notifications").update({ read }).eq("user_id", userId);
 query = id ? query.eq("id", id) : query.eq("read", false);
 const { data, error } = await query.select("id");
 if (error) throw new MoodleError("storage", "No se han podido actualizar tus notificaciones.", 503);
 if (id && !data?.length) throw new MoodleError("not_found", "No se ha encontrado esa notificación.", 404);
 return listNotifications(userId);
}
