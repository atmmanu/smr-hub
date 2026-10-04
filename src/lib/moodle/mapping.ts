import { subjects } from "../data.ts";
import { MoodleError, type MoodleCourse } from "./types.ts";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function mapCourse(fullname: string, shortname: string): string | null {
  const text = normalize(`${fullname} ${shortname}`);
  const compact = text.replaceAll(" ", "");
  const matches = [
    /redeslocales/.test(compact),
    /montaje.*mantenimiento|mantenimiento.*montaje/.test(compact),
    /sistemasoperativosmonopuesto/.test(compact) || /\bsom\b/.test(text),
    /aplicacionesofimaticas/.test(compact),
    /itinerarioparalaempleabilidad/.test(compact) || /\bipe\b/.test(text),
    /programacion.*python|fundamentosdeprogramacion/.test(compact),
  ];
  const indices = matches.flatMap((matched, i) => matched ? [i] : []);
  return indices.length === 1 ? subjects[indices[0]] : null;
}

export function parseCourses(input: unknown): MoodleCourse[] {
  if (!Array.isArray(input) || input.length > 200) throw new MoodleError("invalid_response", "Aula Virtual ha devuelto un listado de cursos inesperado o demasiado grande.");
  const seen = new Set<number>();
  return input.map(raw => {
    if (!raw || typeof raw !== "object" || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.fullname !== "string" || !raw.fullname.trim() || raw.fullname.length > 320 || typeof raw.shortname !== "string" || raw.shortname.length > 320 || seen.has(raw.id))
      throw new MoodleError("invalid_response", "Aula Virtual ha devuelto un curso no válido.");
    seen.add(raw.id);
    return { course_id: raw.id, fullname: raw.fullname, shortname: raw.shortname, subject: mapCourse(raw.fullname, raw.shortname), manual: false };
  });
}
