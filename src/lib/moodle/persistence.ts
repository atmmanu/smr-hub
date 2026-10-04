import "server-only";
import type { AcademicEvent } from "./academic";
import type { MoodleCourse } from "./types";
import { MoodleError } from "./types";
import { adminClient } from "./server";
import type { SyncSummary } from "./academic-types";

export async function persistSnapshot(userId: string, site: string, moodleUserId: number, ciphertext: string, courses: MoodleCourse[], events: AcademicEvent[]): Promise<SyncSummary> {
 const { data, error } = await adminClient().rpc("apply_moodle_sync", { p_user_id: userId, p_site: site, p_moodle_user_id: moodleUserId, p_token_ciphertext: ciphertext, p_courses: courses.filter(c => c.subject).map(c => ({ course_id: c.course_id, subject: c.subject })), p_events: events });
 if (error) throw new MoodleError("storage", "No se ha guardado la sincronización. Comprueba la migración de Fase B o vuelve a intentarlo si cambiaste la conexión o las asignaturas.", 503);
 return data as SyncSummary;
}
