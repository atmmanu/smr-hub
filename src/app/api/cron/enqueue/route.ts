import {NextResponse} from "next/server";
import {assertCron} from "@/lib/cron-auth";
import {MoodleError} from "@/lib/moodle/types";
import {enqueueJobs,pendingJobs} from "@/lib/jobs-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){try{assertCron(request,process.env.CRON_SECRET);if(process.env.JOBS_ENABLED!=="true")throw new MoodleError("disabled","La ejecución automática está desactivada.",503);return NextResponse.json({...await enqueueJobs(),jobs:await pendingJobs()},{headers:{"Cache-Control":"private, no-store"}});}catch(error){const safe=error instanceof MoodleError?error:new MoodleError("jobs","No se puede preparar la ejecución.",503);return NextResponse.json({error:safe.message},{status:safe.status,headers:{"Cache-Control":"private, no-store"}});}}
