import { subjects } from "../data.ts";
import { MoodleError, type MoodleCourse } from "./types.ts";

export type AcademicEvent = {
  external_id: string; external_course_id: number; cmid: number; subject: string;
  title: string; description: string; event_type: string; module_type: string;
  open_date: string | null; due_date: string | null; external_modified_at: string | null;
  external_url: string;
};
function invalid(): never { throw new MoodleError("academic_response", "Aula Virtual ha devuelto contenido incompleto o no válido. No se ha guardado la sincronización.", 502); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) <= 0) return invalid(); return Number(value); }
function date(value: unknown): string | null {
  if (value === undefined || value === null || value === 0) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 253402300799) return invalid();
  return new Date(Number(value) * 1000).toISOString();
}
export function plainText(value: unknown, limit = 8000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 100_000) return invalid();
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] || "";
      const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : "";
    }).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
function visible(row: Record<string, unknown>): boolean {
  return ![false, 0].includes(row.visible as boolean) && ![false, 0].includes(row.uservisible as boolean);
}
export function academicSnapshot(base: string, courses: MoodleCourse[], assignments: unknown, contents: Map<number, unknown>): AcademicEvent[] {
  const mapped = courses.filter(c => c.subject && subjects.includes(c.subject));
  const payload = record(assignments);
  if (!Array.isArray(payload.courses) || !Array.isArray(payload.warnings)) return invalid();
  const assignmentCourses = new Map<number, Record<string, unknown>>();
  for (const value of payload.courses) { const course = record(value); const courseId = id(course.id); if (assignmentCourses.has(courseId)) return invalid(); assignmentCourses.set(courseId, course); }
  const events = new Map<string, AcademicEvent>();
  const visibleModuleIds = new Set<number>();
  for (const course of mapped) {
    const sections = contents.get(course.course_id);
    if (!Array.isArray(sections) || sections.length > 1000) return invalid();
    const modules = new Map<number, Record<string, unknown>>();
    for (const value of sections) {
      const section = record(value); if (!visible(section)) continue;
      if (!Array.isArray(section.modules)) return invalid();
      for (const value of section.modules) { const module = record(value); if (visible(module)) { const cmid = id(module.id); if (modules.has(cmid)) return invalid(); modules.set(cmid, module); visibleModuleIds.add(cmid); } }
    }
    const assignmentCourse = assignmentCourses.get(course.course_id);
    if (!assignmentCourse || !Array.isArray(assignmentCourse.assignments)) return invalid();
    const assignmentModules = new Set<number>();
    for (const value of assignmentCourse.assignments) {
      const row = record(value); const cmid = id(row.cmid); const assignmentId = id(row.id);
      if (id(row.course) !== course.course_id) return invalid();
      if (!modules.has(cmid)) continue;
      assignmentModules.add(cmid);
      add({ external_id: `assign:${assignmentId}`, external_course_id: course.course_id, cmid, subject: course.subject!,
        title: plainText(row.name, 320), description: plainText(row.intro), event_type: "assignment", module_type: "assign",
        open_date: date(row.allowsubmissionsfromdate), due_date: date(row.duedate), external_modified_at: date(row.timemodified),
        external_url: `${base}/mod/assign/view.php?id=${cmid}` });
    }
    for (const [cmid, row] of modules) {
      if (assignmentModules.has(cmid)) continue;
      const moduleType = row.modname;
      if (typeof moduleType !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(moduleType)) return invalid();
      // A visible assignment omitted by mod_assign is a partial response, not a second event.
      if (moduleType === "assign") return invalid();
      const title = plainText(row.name, 320);
      const announcement = moduleType === "forum" && /^(avisos|anuncios|novedades|announcements)$/i.test(title);
      const type = announcement ? "announcement" : moduleType === "forum" ? "forum" : ["resource", "url", "page", "book", "folder"].includes(moduleType) ? "resource" : moduleType === "quiz" ? "exam" : "content";
      add({ external_id: `module:${cmid}`, external_course_id: course.course_id, cmid, subject: course.subject!, title,
        description: plainText(row.description), event_type: type, module_type: moduleType, open_date: null, due_date: null,
        external_modified_at: date(row.timemodified), external_url: `${base}/mod/${moduleType}/view.php?id=${cmid}` });
    }
  }
  for (const value of payload.warnings) {
    const warning = record(value);
    // Hidden assignments can produce module warnings. Only ignore those absent from visible contents.
    if (warning.item !== "module" || visibleModuleIds.has(id(warning.itemid))) return invalid();
  }
  function add(event: AcademicEvent) {
    if (!event.title || events.size >= 2000) return invalid();
    const key = `${event.external_course_id}:${event.external_id}`;
    if (events.has(key)) return invalid(); events.set(key, event);
  }
  return [...events.values()];
}
