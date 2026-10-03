export const subjects = ["Montaje y mantenimiento", "Sistemas operativos", "Redes locales", "Aplicaciones ofimáticas", "Seguridad informática", "Servicios en red", "Aplicaciones web", "Itinerario para la empleabilidad", "Inglés", "Otra"];
export type Task = { id: string; title: string; subject: string; due_date: string; description: string; completed: boolean };
export type Exam = { id: string; subject: string; exam_date: string; topic: string; description: string };
export type QuickLink = { id: string; title: string; url: string };
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}
export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
