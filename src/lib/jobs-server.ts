import "server-only";
import {randomUUID} from "node:crypto";
import {adminClient} from "./moodle/server";
import {syncMoodle} from "./moodle/sync-server";
import {MoodleError} from "./moodle/types";
import {appBaseUrl,sendReminderEmail,type ReminderEmail} from "./brevo";
import {uuidPattern} from "./dashboard-server";
import {isolatedUsers} from "./background";

export async function enqueueJobs(){const {data,error}=await adminClient().rpc("enqueue_background_jobs");if(error)throw new MoodleError("storage","Comprueba la migración de Fase D.",503);return {queued:data};}
export async function pendingJobs(){const {data,error}=await adminClient().from("background_jobs").select("id").eq("status","pending").gte("scheduled_for",new Date(Date.now()-7200000).toISOString()).order("scheduled_for").limit(40);if(error)throw new MoodleError("storage","No se pueden consultar los trabajos.",503);return data||[];}
async function remindersForUser(userId:string,allowMoodle:boolean,deadline:number){
 const admin=adminClient();const {data:count,error}=await admin.rpc("generate_user_reminders",{p_user:userId,p_allow_moodle:allowMoodle});
 if(error)throw new MoodleError("storage","No se han podido generar recordatorios.",503);
 let sent=0;let failed=0;
 if(process.env.REMINDER_EMAIL_ENABLED!=="true")return {reminders:count,emails:sent,email_failures:failed};
 const config={apiKey:process.env.BREVO_API_KEY||"",sender:process.env.BREVO_SENDER_EMAIL||"",base:appBaseUrl(process.env.APP_BASE_URL||""),moodleBase:process.env.MOODLE_BASE_URL||""};
 if(!config.apiKey||!/^\S+@\S+\.\S+$/.test(config.sender))throw new MoodleError("email_configuration","Configura el servicio de email.",503);
 const {data:identity,error:identityError}=await admin.auth.admin.getUserById(userId);
 if(identityError||!identity.user?.email||!identity.user.email_confirmed_at)return {reminders:count,emails:sent,email_failures:failed};
 const {data:logs,error:logsError}=await admin.from("notification_log").select("id").eq("user_id",userId).eq("email_state","pending").order("scheduled_for").limit(10);
 if(logsError)throw new MoodleError("storage","No se han podido consultar los envíos.",503);
 for(const log of logs||[]){
  if(Date.now()+10_000>=deadline)break;
  const {data:email,error:claimError}=await admin.rpc("claim_reminder_email",{p_log:log.id,p_allow_moodle:allowMoodle});
  if(claimError){failed++;continue;}if(!email)continue;
  let result:{state:"sent"|"failed"|"unknown";provider_id?:string;error_code?:string};
  try{result=await sendReminderEmail(email as ReminderEmail,identity.user.email,config);}catch{result={state:"failed",error_code:"email_configuration"};}
  const {error:logged}=await admin.from("notification_log").update({email_state:result.state,email_sent_at:result.state==="sent"?new Date().toISOString():null,provider_id:result.provider_id||null,error_code:result.error_code||null}).eq("id",log.id).eq("email_state","sending");
  if(result.state==="sent"&&!logged)sent++;else failed++;
 }
 return {reminders:count,emails:sent,email_failures:failed};
}
export async function runBackgroundJob(jobId:string){
 if(!uuidPattern.test(jobId))throw new MoodleError("id","Identificador de trabajo no válido.");
 const admin=adminClient();const lease=randomUUID();const {data:job,error}=await admin.rpc("claim_background_job",{p_job:jobId,p_lease:lease});
 if(error)throw new MoodleError("storage","No se puede iniciar el trabajo.",503);if(!job)return {status:"already_claimed"};
 const deadline=Date.now()+100_000;let sync="not_connected";let safeError:string|null=null;let result:Record<string,unknown>={};
 try{
  const outcomes=await isolatedUsers([job.user_id],async userId=>{
   const {data:connection,error:lookup}=await admin.from("moodle_connections").select("connected_at").eq("user_id",userId).maybeSingle();
   if(lookup)throw new MoodleError("storage","No se puede consultar la conexión.",503);
   if(connection?.connected_at){try{await syncMoodle(userId,"automatic");sync="success";}catch(error){sync="failed";safeError=error instanceof MoodleError?error.code:"sync_failed";}}
   return remindersForUser(userId,sync==="success",deadline);
  });
  if(!outcomes[0].ok)throw new MoodleError("job_failed","No se completó el trabajo.",503);
  result={sync,...outcomes[0].value};
  const status=sync==="failed"||Number(result.email_failures)>0?"partial":"success";
  const {error:finished}=await admin.from("background_jobs").update({status,finished_at:new Date().toISOString(),result,error_code:safeError,expires_at:null}).eq("id",job.id).eq("lease",lease);
  if(finished)throw new MoodleError("storage","No se puede guardar el resultado.",503);
  return {status,...result};
 }catch(error){await admin.from("background_jobs").update({status:"failed",finished_at:new Date().toISOString(),error_code:error instanceof MoodleError?error.code:"job_failed",expires_at:null}).eq("id",job.id).eq("lease",lease);throw error;}
}
