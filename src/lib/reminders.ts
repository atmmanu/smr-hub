import {madridDate,madridInstant,shiftDate} from "./calendar.ts";
export type NotificationPreferences={days:number[];internal_enabled:boolean;email_enabled:boolean};
export const defaultPreferences:NotificationPreferences={days:[7,3,1],internal_enabled:true,email_enabled:false};
export type ReminderEvent={id:string;source:"moodle"|"general"|"personal";title:string;subject:string|null;due_at:string;hidden:boolean;completed:boolean;reminder_enabled:boolean;email_enabled:boolean;external_url:string|null};
export type ReminderCandidate={event:ReminderEvent;days:number;scheduled_for:string;key:string};
export function validatePreferences(value:Record<string,unknown>):NotificationPreferences{
 if(!Array.isArray(value.days)||value.days.length>4||value.days.some(day=>!Number.isInteger(day)||![0,1,3,7].includes(day))||new Set(value.days).size!==value.days.length||typeof value.internal_enabled!=="boolean"||typeof value.email_enabled!=="boolean")throw new Error("Selecciona los intervalos y canales de aviso válidos.");
 return {days:[...value.days].sort((a,b)=>b-a),internal_enabled:value.internal_enabled,email_enabled:value.email_enabled};
}
export function reminderCandidate(event:ReminderEvent,prefs:NotificationPreferences,days:number,now=new Date()):ReminderCandidate|null{
 if(event.hidden||event.completed||!event.reminder_enabled||!prefs.days.includes(days)||(!prefs.internal_enabled&&!prefs.email_enabled)||Date.parse(event.due_at)<=now.getTime())return null;
 const date=shiftDate(madridDate(event.due_at),-days);
 let scheduled=madridInstant(`${date}T09:00`);
 if(days===0&&Date.parse(scheduled)>=Date.parse(event.due_at))scheduled=madridInstant(`${date}T00:00`);
 const elapsed=now.getTime()-Date.parse(scheduled);
 if(elapsed<0||elapsed>=90*60_000)return null;
 return {event,days,scheduled_for:scheduled,key:`${event.source}:${event.id}:${new Date(event.due_at).toISOString()}:${days}`};
}
export function reminderTitle(event:ReminderEvent,days:number){const kind=event.source==="moodle"?"Entrega":event.source==="general"?"Evento de clase":"Evento personal";return `${kind} ${days===0?"hoy":days===1?"mañana":`en ${days} días`}`;}
