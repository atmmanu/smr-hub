import test from "node:test";
import assert from "node:assert/strict";
import {reminderCandidate,validatePreferences,type ReminderEvent} from "../src/lib/reminders.ts";
import {madridInstant} from "../src/lib/calendar.ts";
import {assertCron} from "../src/lib/cron-auth.ts";
import {isolatedUsers} from "../src/lib/background.ts";
import {sendReminderEmail,emailText,appBaseUrl,type ReminderEmail} from "../src/lib/brevo.ts";

const prefs={days:[7,3,1,0],internal_enabled:true,email_enabled:false};
const event:ReminderEvent={id:"61000000-0000-0000-0000-000000000001",source:"moodle",title:"IPv6",subject:"Redes Locales",due_at:madridInstant("2026-10-12T23:59"),hidden:false,completed:false,reminder_enabled:true,email_enabled:true,external_url:null};
for(const [days,date] of [[7,"2026-10-05"],[3,"2026-10-09"],[1,"2026-10-11"],[0,"2026-10-12"]] as const){
 test(`D: recordatorio ${days} días antes a las 09:00 de Madrid`,()=>{
  assert.ok(reminderCandidate(event,prefs,days,new Date(madridInstant(`${date}T09:00`))));
  assert.equal(reminderCandidate(event,prefs,days,new Date(madridInstant(`${date}T08:59`))),null);
  assert.equal(reminderCandidate(event,prefs,days,new Date(madridInstant(`${date}T10:30`))),null);
 });
}
test("D: excluye completados, ocultos, vencidos, desactivados y ambos canales apagados",()=>{
 const now=new Date(madridInstant("2026-10-05T09:00"));
 for(const changed of [{completed:true},{hidden:true},{reminder_enabled:false},{due_at:now.toISOString()}])assert.equal(reminderCandidate({...event,...changed},prefs,7,now),null);
 assert.equal(reminderCandidate(event,{...prefs,internal_enabled:false,email_enabled:false},7,now),null);
 assert.ok(reminderCandidate(event,{...prefs,internal_enabled:false,email_enabled:true},7,now));
 assert.equal(reminderCandidate(event,{...prefs,days:[1]},7,now),null);
});
test("D: cambio de entrega y prórroga individual recalculan clave sin compartir fechas",()=>{
 const first=reminderCandidate(event,prefs,7,new Date(madridInstant("2026-10-05T09:00")))!;
 const extended={...event,due_at:madridInstant("2026-10-15T23:59")};
 assert.equal(reminderCandidate(extended,prefs,7,new Date(madridInstant("2026-10-05T09:00"))),null);
 const next=reminderCandidate(extended,prefs,7,new Date(madridInstant("2026-10-08T09:00")))!;
 assert.notEqual(first.key,next.key);assert.equal(event.due_at,madridInstant("2026-10-12T23:59"));
});
test("D: Madrid conserva 09:00 al cruzar DST y entrega temprana avisa a medianoche",()=>{
 for(const [due,reminder] of [["2026-10-26T23:59","2026-10-25T09:00"],["2026-03-30T23:59","2026-03-29T09:00"]]){
  assert.equal(reminderCandidate({...event,due_at:madridInstant(due)},prefs,1,new Date(madridInstant(reminder)))?.scheduled_for,madridInstant(reminder));
 }
 const early={...event,due_at:madridInstant("2026-10-12T08:00")};
 assert.equal(reminderCandidate(early,prefs,0,new Date(madridInstant("2026-10-12T00:00")))?.scheduled_for,madridInstant("2026-10-12T00:00"));
});
test("D: preferencias validan intervalos, canales y no aceptan duplicados ni valores inventados",()=>{
 assert.deepEqual(validatePreferences(prefs),prefs);
 for(const value of [{...prefs,days:[1,1]},{...prefs,days:[2]},{...prefs,email_enabled:"true"}])assert.throws(()=>validatePreferences(value));
 assert.deepEqual(validatePreferences({...prefs,days:[]}).days,[]);
});
test("D: cron exige secreto largo y Bearer exacto sin sesión de navegador",()=>{
 const secret="x".repeat(48);
 assert.throws(()=>assertCron(new Request("https://smrhub.vercel.app/api/cron/worker"),secret),e=>(e as {status:number}).status===401);
 assert.throws(()=>assertCron(new Request("http://localhost:3000"),undefined),e=>(e as {status:number}).status===503);
 assert.throws(()=>assertCron(new Request("http://localhost:3000",{headers:{authorization:`Bearer ${"y".repeat(48)}`}}),secret));
 assert.doesNotThrow(()=>assertCron(new Request("http://localhost:3000",{headers:{authorization:`Bearer ${secret}`}}),secret));
});
test("D: un usuario falla y los siguientes se procesan",async()=>{
 const seen:string[]=[];const outcomes=await isolatedUsers(["a","b","c"],async user=>{seen.push(user);if(user==="b")throw new Error("token privado");return 1;});
 assert.deepEqual(seen,["a","b","c"]);assert.deepEqual(outcomes.map(o=>o.ok),[true,false,true]);assert.ok(!JSON.stringify(outcomes).includes("token privado"));
});
const email:ReminderEmail={id:"62000000-0000-0000-0000-000000000001",user_id:"60000000-0000-0000-0000-000000000002",source:"moodle",event_id:event.id,title:event.title,subject:event.subject,due_at:event.due_at,days:1,external_url:null};
const config={apiKey:"fake-test-key",sender:"smr@example.invalid",base:"http://localhost:3000",moodleBase:"https://aulavirtual34.educa.madrid.org/ies.jovellanos.fuenlabrada"};
test("D: Brevo servidor, contenido mínimo y clave estable; todos los envíos de prueba son simulados",async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(input,init)=>{calls++;assert.equal(input,"https://api.brevo.com/v3/smtp/email");assert.equal(new Headers(init?.headers).get("api-key"),config.apiKey);const body=JSON.parse(String(init?.body));assert.equal(body.headers["Idempotency-Key"],email.id);assert.ok(!body.textContent.includes(email.user_id));assert.equal(init?.redirect,"error");return new Response(JSON.stringify({messageId:"test-receipt"}),{status:201});};
 assert.deepEqual(await sendReminderEmail(email,"pupil@example.invalid",config,fetcher),{state:"sent",provider_id:"test-receipt"});assert.equal(calls,1);
 assert.ok(emailText(email,config.base).includes("23:59"));assert.ok(emailText(email,config.base).includes("localhost:3000/dashboard/calendario"));
 assert.equal(appBaseUrl("http://localhost:3001"),"http://localhost:3001");assert.throws(()=>appBaseUrl("http://untrusted.invalid"));
});
test("D: Brevo errores ambiguos no autorizan reenvío y enlaces externos son rechazados",async()=>{
 assert.equal((await sendReminderEmail(email,"pupil@example.invalid",config,async()=>{throw new Error("private-secret");})).state,"unknown");
 assert.equal((await sendReminderEmail(email,"pupil@example.invalid",config,async()=>new Response("",{status:429}))).error_code,"brevo_limit");
 assert.equal((await sendReminderEmail(email,"pupil@example.invalid",config,async()=>new Response("",{status:503}))).state,"unknown");
 await assert.rejects(()=>sendReminderEmail({...email,external_url:"https://evil.invalid/mod/assign/view.php?id=1"},"pupil@example.invalid",config));
});
