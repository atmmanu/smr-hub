import "server-only";
import {serverClient} from "./supabase/server";
import {defaultPreferences,validatePreferences} from "./reminders";
import {MoodleError} from "./moodle/types";
export async function getPreferences(userId:string){
 const client=await serverClient(); const [prefs,run]=await Promise.all([client.from("notification_preferences").select("days,internal_enabled,email_enabled").eq("user_id",userId).maybeSingle(),client.from("moodle_sync_runs").select("started_at,finished_at,result,mode").eq("user_id",userId).order("started_at",{ascending:false}).limit(1)]);
 if(prefs.error||run.error)throw new MoodleError("storage","Comprueba la migración de Fase D para configurar tus avisos.",503);
 return {preferences:prefs.data||defaultPreferences,last_sync:run.data?.[0]||null};
}
export async function savePreferences(userId:string,body:Record<string,unknown>){
 let prefs;try{prefs=validatePreferences(body);}catch(error){throw new MoodleError("input",error instanceof Error?error.message:"Revisa tus preferencias.");}
 const client=await serverClient();const {data:existing,error:lookup}=await client.from("notification_preferences").select("user_id").eq("user_id",userId).maybeSingle();
 if(lookup)throw new MoodleError("storage","No se han podido guardar las preferencias.",503);
 const query=existing?client.from("notification_preferences").update(prefs).eq("user_id",userId):client.from("notification_preferences").insert(prefs);
 const {error}=await query;
 if(error)throw new MoodleError("storage","No se han podido guardar las preferencias. Vuelve a intentarlo.",503);
 return getPreferences(userId);
}
