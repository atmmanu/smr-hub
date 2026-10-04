import {NextResponse} from "next/server";
import {assertCron} from "@/lib/cron-auth";
import {readMoodleRequest} from "@/lib/moodle/request";
import {MoodleError} from "@/lib/moodle/types";
import {runBackgroundJob} from "@/lib/jobs-server";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=120;
export async function POST(request:Request){
 try{assertCron(request,process.env.CRON_SECRET);if(process.env.JOBS_ENABLED!=="true")throw new MoodleError("disabled","La ejecución automática está desactivada.",503);const body=await readMoodleRequest(request);if(typeof body.job_id!=="string")throw new MoodleError("id","Selecciona un trabajo válido.");return NextResponse.json(await runBackgroundJob(body.job_id),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){const safe=error instanceof MoodleError?error:new MoodleError("job_failed","No se ha completado el trabajo.",503);return NextResponse.json({error:safe.message},{status:safe.status,headers:{"Cache-Control":"private, no-store"}});}
}
