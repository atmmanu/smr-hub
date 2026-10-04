import { academicSnapshot, type AcademicEvent } from "./academic.ts";
import { type MoodleCourse, MoodleError } from "./types.ts";

export type AcademicSource = {
 assignments(token: string, ids: number[]): Promise<unknown>;
 contents(token: string, id: number): Promise<unknown>;
};
export async function collectAcademicEvents(source: AcademicSource, token: string, site: string, courses: MoodleCourse[]): Promise<AcademicEvent[]> {
 const mapped = courses.filter(c => c.subject !== null);
 if (!mapped.length) throw new MoodleError("mapping", "Asocia al menos un curso a una asignatura antes de sincronizar.");
 if (mapped.length > 12) throw new MoodleError("course_limit", "Asocia como máximo doce cursos para esta primera versión.");
 const assignments = await source.assignments(token, mapped.map(c => c.course_id));
 const contents = new Map<number, unknown>();
 // Small batches bound concurrency and avoid overwhelming the centre's Moodle.
 for (let index = 0; index < mapped.length; index += 2) {
  await Promise.all(mapped.slice(index, index + 2).map(async course => { contents.set(course.course_id, await source.contents(token, course.course_id)); }));
 }
 return academicSnapshot(site, mapped, assignments, contents);
}
