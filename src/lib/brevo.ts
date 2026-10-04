import {MoodleError} from "./moodle/types.ts";
export type ReminderEmail={id:string;user_id:string;source:"moodle"|"general"|"personal";event_id:string;title:string;subject:string|null;due_at:string;days:number;external_url:string|null};
export function appBaseUrl(value:string){let url:URL;try{url=new URL(value);}catch{throw new MoodleError("email_configuration","Configura la URL de SMR HUB.",503);}
 if((url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)))||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new MoodleError("email_configuration","Configura una URL de SMR HUB válida.",503);return url.origin;}
export function emailText(reminder:ReminderEmail,base:string){
 const date=new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Madrid",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(reminder.due_at));
 const link=`${appBaseUrl(base)}/dashboard/calendario?source=${reminder.source}&event=${reminder.event_id}`;
 return ["SMR HUB · 1ºD SMR","Recordatorio de clase",reminder.subject||"",reminder.title,`Fecha: ${date}`,reminder.days===0?"Es hoy.":`Queda${reminder.days===1?"":"n"} ${reminder.days} día${reminder.days===1?"":"s"}.`,`Abrir en SMR HUB: ${link}`,...(reminder.external_url?[`Abrir en Aula Virtual: ${reminder.external_url}`]:[]),`Cambiar tus avisos: ${appBaseUrl(base)}/dashboard/configuracion`].filter(Boolean).join("\n\n");
}
export type BrevoConfig={apiKey:string;sender:string;base:string;moodleBase:string};
export async function sendReminderEmail(reminder:ReminderEmail,to:string,config:BrevoConfig,fetcher:typeof fetch=fetch):Promise<{state:"sent"|"failed"|"unknown";provider_id?:string;error_code?:string}>{
 if(!config.apiKey||!/^\S+@\S+\.\S+$/.test(config.sender)||!/^\S+@\S+\.\S+$/.test(to))throw new MoodleError("email_configuration","Configura el remitente y la API de Brevo.",503);
 appBaseUrl(config.base);
 // Only keep known Moodle view links, with no credential/query from untrusted content.
 if(reminder.external_url){const url=new URL(reminder.external_url);const moodle=new URL(config.moodleBase);if(url.origin!==moodle.origin||url.username||url.password||url.hash||[...url.searchParams.keys()].some(k=>k!=="id")||!url.pathname.startsWith(moodle.pathname.replace(/\/$/,"")+"/mod/"))throw new MoodleError("email_link","No se puede generar el enlace del recordatorio.");}
 try{
  const response=await fetcher("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":config.apiKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({sender:{name:"SMR HUB",email:config.sender},to:[{email:to}],subject:`SMR HUB · ${reminder.days===0?"Recordatorio para hoy":`Recordatorio en ${reminder.days} días`}`,textContent:emailText(reminder,config.base),headers:{"Idempotency-Key":reminder.id}}),redirect:"error",signal:AbortSignal.timeout(8_000)});
  if(!response.ok)return {state:response.status>=500?"unknown":"failed",error_code:response.status===429?"brevo_limit":"brevo_rejected"};
  const reader=response.body?.getReader();let text="";
  if(reader){const decoder=new TextDecoder();let bytes=0;while(true){const part=await reader.read();if(part.done){text+=decoder.decode();break;}bytes+=part.value.byteLength;if(bytes>4096){await reader.cancel();return {state:"sent"};}text+=decoder.decode(part.value,{stream:true});}}
  let provider_id:string|undefined;try{const body=JSON.parse(text);if(typeof body.messageId==="string"&&body.messageId.length<=512)provider_id=body.messageId;}catch{/* Accepted response is enough; never retry due to a malformed receipt. */}
  return {state:"sent",provider_id};
 }catch{return {state:"unknown",error_code:"brevo_unknown"};}
}
