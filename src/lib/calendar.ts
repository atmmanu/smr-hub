import { subjects } from "./data.ts";
export const TIME_ZONE = "Europe/Madrid";
export type CalendarSource = "moodle" | "general" | "personal";
export type CalendarEvent = {
 id: string; source: CalendarSource; title: string; description: string; subject: string | null;
 start_at: string; end_at: string | null; start_date: string | null; end_date: string | null; all_day: boolean;
 event_type: string; completed: boolean; read: boolean; hidden: boolean; favourite: boolean; external_url: string | null; has_date?: boolean; reminder_enabled?: boolean;
};
export type CalendarData = { events: CalendarEvent[]; is_admin: boolean; truncated: boolean };
export const sourceLabels: Record<CalendarSource, string> = { moodle: "🏫 Aula Virtual", general: "👥 General", personal: "👤 Personal" };
export const eventTypes = ["activity", "exam", "deadline", "holiday", "other"] as const;
export function madridDate(value: string | Date = new Date()): string {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
 return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}
export function validDate(value: string): boolean {
 const date = new Date(`${value}T12:00:00Z`);
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "9999-12-31" && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function shiftDate(value: string, days: number): string {
 const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function madridInput(value: string): string {
 const date = madridDate(value);
 const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
 return `${date}T${time}`;
}
export function madridInstant(local: string): string {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !validDate(local.slice(0, 10)) || Number(local.slice(11, 13)) > 23 || Number(local.slice(14)) > 59) throw new Error("Introduce una fecha y hora válidas.");
 const clock = Date.parse(`${local}:00Z`);
 // Derive offsets from the IANA zone around this date, including historical Madrid offsets.
 const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const offsets=new Set([-36,0,36].map(hours=>{const instant=clock+hours*3600000;const parts=formatter.formatToParts(new Date(instant));const part=(name:string)=>Number(parts.find(p=>p.type===name)!.value);return Date.UTC(part("year"),part("month")-1,part("day"),part("hour"),part("minute"),part("second"))-instant;}));
 const candidates=[...offsets].map(offset=>new Date(clock-offset).toISOString()).filter(value=>madridInput(value)===local).sort();
 if (!candidates.length) throw new Error("Esa hora no existe en Madrid por el cambio al horario de verano. Elige otra hora.");
 return candidates[0]; // Autumn repeated hour: first occurrence, documented in the form/guide.
}
export function displayDate(event: Pick<CalendarEvent, "all_day" | "start_at" | "start_date">): string {
 const date = event.all_day && event.start_date ? new Date(`${event.start_date}T12:00:00Z`) : new Date(event.start_at);
 return new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short", ...(event.all_day ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(date) + (event.all_day ? " · Todo el día" : "");
}
export function relativeDay(value: string, now = new Date()): string {
 const days = Math.round((Date.parse(`${value}T12:00:00Z`) - Date.parse(`${madridDate(now)}T12:00:00Z`)) / 86400000);
 return days === 0 ? "Hoy" : days === 1 ? "Mañana" : days > 1 && days < 8 ? `En ${days} días` : new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00Z`));
}
export function relativeTime(value: string, now = Date.now()): string {
 const minutes = Math.round((Date.parse(value) - now) / 60000);
 const format = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
 return Math.abs(minutes) < 60 ? format.format(minutes, "minute") : Math.abs(minutes) < 1440 ? format.format(Math.round(minutes / 60), "hour") : format.format(Math.round(minutes / 1440), "day");
}
export function filterCalendar(events: CalendarEvent[], source: string = "all", subject = "", includeHidden = false): CalendarEvent[] {
 return events.filter(e => (includeHidden || !e.hidden) && (source === "all" || e.source === source) && (!subject || e.subject === subject)).sort((a,b) => Date.parse(a.start_at)-Date.parse(b.start_at) || a.id.localeCompare(b.id));
}
export function upcomingCalendar(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
 return filterCalendar(events).filter(e => e.all_day ? (e.end_date || e.start_date || madridDate(e.start_at)) >= madridDate(now) : Date.parse(e.end_at || e.start_at) >= now.getTime());
}
export function monthCells(month: string): string[] {
 const first = `${month}-01`; const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
 const start = shiftDate(first, (weekday + 6) % 7 * -1); return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}
export function occursOn(event: CalendarEvent, day: string): boolean {
 const start = event.start_date || madridDate(event.start_at); const end = event.end_date || (event.end_at ? madridDate(new Date(Date.parse(event.end_at)-1)) : start);
 return start <= day && end >= day;
}
export function validateCalendarInput(body: Record<string, unknown>) {
 const text = (key: string, max: number, required = false) => { const value = body[key] ?? ""; if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("Revisa el título y la descripción del evento."); return value.trim(); };
 const title = text("title", 160, true); const description = text("description", 4000);
 if (body.subject !== null && body.subject !== "" && (typeof body.subject !== "string" || !subjects.includes(body.subject))) throw new Error("Selecciona una de las seis asignaturas.");
 if (!eventTypes.includes(body.event_type as typeof eventTypes[number]) || typeof body.all_day !== "boolean") throw new Error("Selecciona un tipo y una fecha válidos.");
 const start = text("start", 32, true); const end = text("end", 32);
 const allDay = body.all_day;
 if (allDay && (!validDate(start) || (end && !validDate(end)))) throw new Error("Introduce una fecha válida.");
 const startAt = madridInstant(allDay ? `${start}T00:00` : start);
 const endAt = end ? madridInstant(allDay ? `${shiftDate(end, 1)}T00:00` : end) : allDay ? madridInstant(`${shiftDate(start, 1)}T00:00`) : null;
 if ((allDay && end && end < start) || (endAt && endAt <= startAt)) throw new Error("La fecha final debe ser posterior al inicio.");
 return { title, description, subject: body.subject || null, event_type: body.event_type as string, all_day: allDay, start_at: startAt, end_at: endAt, start_date: allDay ? start : null, end_date: allDay ? end || start : null };
}
