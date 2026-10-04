import "server-only";
import { NextResponse } from "next/server";
import { serverClient } from "./supabase/server";
import { assertSameOrigin } from "./moodle/request";
import { MoodleError } from "./moodle/types";
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function dashboardResponse(request: Request, action: (userId: string) => Promise<unknown>) {
 try {
  if (request.method !== "GET") assertSameOrigin(request);
  const client = await serverClient(); const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new MoodleError("unauthenticated", "Inicia sesión para acceder a tu espacio.", 401);
  return NextResponse.json(await action(data.user.id), { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) {
  const safe = error instanceof MoodleError ? error : new MoodleError("storage", "No se ha podido completar la operación. Comprueba la migración de Fase C o vuelve a intentarlo.", 503);
  return NextResponse.json({ error: safe.message }, { status: safe.status, headers: { "Cache-Control": "private, no-store" } });
 }
}
