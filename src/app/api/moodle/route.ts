import { NextResponse } from "next/server";
import { authorizeMoodle, moodleStatus, connectMoodle, mapMoodleCourse, disconnectMoodle } from "@/lib/moodle/server";
import { MoodleError } from "@/lib/moodle/types";
import { readMoodleRequest } from "@/lib/moodle/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  try {
    const userId = await authorizeMoodle(request);
    const result = request.method === "GET" ? await moodleStatus(userId)
      : request.method === "DELETE" ? await disconnectMoodle(userId)
      : request.method === "PATCH" ? await mapMoodleCourse(userId, await readMoodleRequest(request))
      : await connectMoodle(userId, await readMoodleRequest(request));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    // Nunca enviar al navegador errores crudos de Moodle/Supabase ni escribirlos en logs.
    const safe = error instanceof MoodleError ? error : new MoodleError("internal", "No se puede completar esta operación con Aula Virtual. Inténtalo más tarde.", 500);
    return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { "Cache-Control": "private, no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
