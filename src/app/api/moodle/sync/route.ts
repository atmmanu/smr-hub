import { NextResponse } from "next/server";
import { authorizeMoodle } from "@/lib/moodle/server";
import { academicFeed, syncMoodle, updatePersonal } from "@/lib/moodle/sync-server";
import { readMoodleRequest } from "@/lib/moodle/request";
import { MoodleError } from "@/lib/moodle/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(request: Request) {
 try {
  const userId = await authorizeMoodle(request);
  const data = request.method === "POST" ? { summary: await syncMoodle(userId), feed: await academicFeed(userId) } : request.method === "PATCH" ? await updatePersonal(userId, await readMoodleRequest(request)) : await academicFeed(userId);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) {
  const safe = error instanceof MoodleError ? error : new MoodleError("sync", "No se ha podido completar la operación. Espera un minuto y vuelve a intentarlo.", 503);
  return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { "Cache-Control": "private, no-store" } });
 }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
