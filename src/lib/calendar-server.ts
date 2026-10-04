import "server-only";
import { serverClient } from "./supabase/server";
import { moodleStatus } from "./moodle/server";
import { MoodleError } from "./moodle/types";
import { uuidPattern } from "./dashboard-server";
import { subjects } from "./data";
import { filterCalendar, madridDate, madridInstant, shiftDate, validDate, validateCalendarInput, type CalendarData, type CalendarEvent } from "./calendar";

export async function calendarAdmin(userId: string) {
 const client = await serverClient(); const { data, error } = await client.from("profiles").select("role").eq("id", userId).single();
 if (error) throw new MoodleError("profile", "No se pueden comprobar los permisos del calendario.", 503);
 return data.role === "admin";
}
export async function calendarData(userId: string, params: URLSearchParams): Promise<CalendarData> {
 const today = madridDate(); const from = params.get("from") || `${today.slice(0,7)}-01`; const to = params.get("to") || shiftDate(today,180);
 if (!validDate(from) || !validDate(to) || to <= from || Date.parse(to)-Date.parse(from)>366*86400000) throw new MoodleError("dates", "Selecciona un intervalo de calendario válido de hasta un año.");
 const single = params.get("event"); const source = params.get("source") || "all"; const subject = params.get("subject") || "";
 if ((single && (!uuidPattern.test(single) || !["moodle","general","personal"].includes(source))) || !["all","moodle","general","personal"].includes(source)) throw new MoodleError("filter", "Selecciona un evento o filtro válido.");
 if (subject && !subjects.includes(subject)) throw new MoodleError("subject","Selecciona una de las seis asignaturas.");
 const start = madridInstant(`${from}T00:00`); const end = madridInstant(`${to}T00:00`); const client = await serverClient();
 const isAdmin = await calendarAdmin(userId);
 const rows: CalendarEvent[] = []; let truncated = false;
 for (const [kind, table] of [["general","class_calendar_events"],["personal","personal_calendar_events"]] as const) {
  if (source !== "all" && source !== kind) continue;
  const readRows = (withReminder:boolean) => {
   let query = client.from(table).select("id,title,description,subject,start_at,end_at,start_date,end_date,all_day,event_type" + (kind === "personal" ? ",completed"+(withReminder?",reminder_enabled":"") : ""));
   if (kind === "personal") query = query.eq("user_id",userId);
   if (single) query = query.eq("id",single);
   else query = query.lt("start_at",end).or(`end_at.gte.${start},and(end_at.is.null,start_at.gte.${start})`);
   return query.order("start_at").limit(501);
  };
  let result=await readRows(true);
  if(kind==="personal" && ["42703","PGRST204"].includes(result.error?.code||""))result=await readRows(false);
  const { data, error } = result;
  if (error) throw new MoodleError("storage", "No se puede cargar el calendario. Comprueba la migración de Fase C.",503);
  truncated ||= (data?.length || 0)>500;
  for (const value of (data || []).slice(0,500)) { const row = value as unknown as Omit<CalendarEvent,"source"|"read"|"hidden"|"favourite"|"external_url">; rows.push({ ...row, source: kind, completed: Boolean(row.completed), read: false, hidden: false, favourite: false, external_url: null }); }
 }
 if (source === "all" || source === "moodle") {
  let query = client.from("user_event_state").select("common_event_id,effective_due_date,effective_open_date,completed,read,hidden,favourite,common_events!inner(id,title,description,subject,external_course_id,event_type,external_url,due_date,open_date,start_at,end_at)").eq("user_id",userId).eq("available",true);
  if (single) query = query.eq("common_event_id",single);
  // Load only dated rows in this range; include reserved common dates for future academic sources.
  else query = query.eq("hidden",false).or(`and(effective_due_date.gte.${start},effective_due_date.lt.${end}),and(effective_due_date.is.null,effective_open_date.gte.${start},effective_open_date.lt.${end}),and(effective_due_date.is.null,effective_open_date.is.null)`);
  const { data, error } = await query.order("effective_due_date",{nullsFirst:false}).limit(501);
  if (error) throw new MoodleError("storage", "No se pueden cargar los eventos de Aula Virtual.",503);
  truncated ||= (data?.length || 0)>500;
  const status = await moodleStatus(userId);
  for (const value of (data || []).slice(0,500)) {
   const common = value.common_events as unknown as {id:string;title:string;description:string;subject:string;external_course_id:number;event_type:string;external_url:string;due_date:string|null;open_date:string|null;start_at:string|null;end_at:string|null};
   const date = value.effective_due_date || common.due_date || common.start_at || value.effective_open_date || common.open_date;
   if (!date && !single) continue;
   if (!single && (Date.parse(date!) < Date.parse(start) || Date.parse(date!) >= Date.parse(end))) continue;
   rows.push({ id: common.id, source:"moodle", title:common.title, description:common.description, subject:status.courses.find(c=>c.course_id===common.external_course_id)?.subject || common.subject, start_at:date || new Date().toISOString(), has_date:Boolean(date), end_at:null,start_date:null,end_date:null,all_day:false,event_type:common.event_type,completed:value.completed,read:value.read,hidden:value.hidden,favourite:value.favourite,external_url:common.external_url });
  }
 }
 if (single && !rows.length) throw new MoodleError("not_found","El evento ya no está disponible para tu cuenta.",404);
 return { events: filterCalendar(rows,source,subject,Boolean(single)), is_admin:isAdmin, truncated };
}

export async function changeCalendar(userId: string, method: string, body: Record<string, unknown>) {
 if (!["personal","general"].includes(String(body.source))) throw new MoodleError("source","Los eventos de Aula Virtual solo se modifican en Moodle.",403);
 const general = body.source === "general";
 if (general && !await calendarAdmin(userId)) throw new MoodleError("forbidden","Solo un administrador puede modificar eventos generales.",403);
 if (method !== "POST" && (typeof body.id !== "string" || !uuidPattern.test(body.id))) throw new MoodleError("id","Selecciona un evento válido.");
 const client = await serverClient(); const table = general ? "class_calendar_events" : "personal_calendar_events";
 let fields: Record<string,unknown> = {};
 if (method !== "DELETE") {
  if (method === "PATCH" && Object.keys(body).every(k=>["source","id","completed"].includes(k)) && typeof body.completed === "boolean" && !general) fields={completed:body.completed};
  else { try { fields=validateCalendarInput(body); if(!general && body.reminder_enabled!==undefined){if(typeof body.reminder_enabled!=="boolean")throw new Error("Revisa el recordatorio del evento.");fields.reminder_enabled=body.reminder_enabled;} } catch(error) { throw new MoodleError("input",error instanceof Error ? error.message : "Revisa los datos del evento."); } }
 }
 if (method === "POST") {
  let result=await client.from(table).insert(fields).select("id").single();
  if(!general && fields.reminder_enabled!==undefined && ["42703","PGRST204"].includes(result.error?.code||"")){
   const legacy={...fields};delete legacy.reminder_enabled;
   result=await client.from(table).insert(legacy).select("id").single();
  }
  const { data,error }=result;
  if (error) throw new MoodleError("storage","No se ha podido crear el evento. Revisa sus fechas y permisos."); return {id:data.id};
 }
 const applyChange=(values:Record<string,unknown>)=>{
  let query=method==="DELETE"?client.from(table).delete():client.from(table).update(values);
  query=query.eq("id",body.id);if(!general)query=query.eq("user_id",userId);
  return query.select("id");
 };
 let result=await applyChange(fields);
 if(!general && fields.reminder_enabled!==undefined && ["42703","PGRST204"].includes(result.error?.code||"")){
  const legacy={...fields};delete legacy.reminder_enabled;result=await applyChange(legacy);
 }
 const {data,error}=result;
 if (error) throw new MoodleError("storage","No se ha podido modificar el evento.");
 if (!data?.length) throw new MoodleError("not_found","No se ha encontrado un evento que puedas modificar.",404);
 return {id:data[0].id};
}
