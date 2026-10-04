"use client";
import { useEffect, useState } from "react";
import type { AcademicFeed, SyncSummary } from "@/lib/moodle/academic-types";
import { academicUpdated } from "@/lib/dashboard-client";

const labels: Record<string, string> = { assignment: "Tarea", resource: "Recurso", forum: "Foro", announcement: "Avisos", exam: "Cuestionario", content: "Actividad" };
export function MoodleSyncPanel({ revision, disabled }: { revision: string; disabled: boolean }) {
 const [feed, setFeed] = useState<AcademicFeed | null>(null);
 const [summary, setSummary] = useState<SyncSummary | null>(null);
 const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 const [showHidden, setShowHidden] = useState(false);
 useEffect(() => {
  const abort = new AbortController(); setFeed(null); setSummary(null); setError("");
  fetch("/api/moodle/sync", { cache: "no-store", signal: abort.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!abort.signal.aborted) setFeed(data); }).catch(e => { if (!abort.signal.aborted) setError(e.message || "No se ha podido cargar el contenido."); });
  return () => abort.abort();
 }, [revision]);
 async function request(method: string, body?: Record<string, unknown>) {
  setBusy(true); setError("");
  try {
   const response = await fetch("/api/moodle/sync", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(65_000) });
   const data = await response.json(); if (!response.ok) throw new Error(data.error);
   if (method === "POST") { setSummary(data.summary); setFeed(data.feed); } else setFeed(data);
   academicUpdated();
  } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "La consulta tarda demasiado. Espera un minuto y vuelve a intentarlo."); }
  finally { setBusy(false); }
 }
 return <div className="mt-8 border-t border-[#26364e] pt-7">
  <div className="flex flex-wrap justify-between gap-4"><div><h3 className="font-semibold">3. Tareas y contenidos de clase</h3><p className="muted mt-2 text-sm">Última sincronización: {feed?.last_synced_at ? new Date(feed.last_synced_at).toLocaleString("es-ES") : "Pendiente"}</p></div><button className="primary" disabled={busy || disabled} onClick={() => request("POST")}>{busy ? "Guardando…" : "Sincronizar ahora"}</button></div>
  <p className="muted mt-3 text-sm">La primera consulta importa el histórico sin llenar tus avisos. Sincroniza para buscar nuevas actividades y cambios de fechas. Espera un minuto entre consultas.</p>
  {error && <p className="message error mt-4" role="alert">{error}</p>}
  {summary && <div className="message mt-4" role="status"><p className="font-semibold">Sincronización completada</p><p>{summary.tasks} tareas {summary.first_sync ? "importadas" : "nuevas"} · {summary.resources} contenidos {summary.first_sync ? "importados" : "nuevos"} · {summary.updates} actualizaciones</p>{summary.first_sync && <p className="text-sm mt-1">Histórico guardado como base inicial, sin notificaciones.</p>}</div>}
  {!!feed?.notifications.length && <div className="mt-6"><h4 className="font-semibold">Tus avisos recientes</h4><div className="space-y-2 mt-3">{feed.notifications.map(n => <div key={n.id} className="rounded-xl border border-[#26364e] p-3 flex justify-between gap-3"><div><p className="font-medium">{n.title}{n.read ? " · Leído" : ""}</p><p className="muted text-sm">{n.message}</p></div><button disabled={busy || disabled} className="secondary text-xs" onClick={() => request("PATCH", { kind: "notification", id: n.id, read: !n.read })}>{n.read ? "Marcar pendiente" : "Marcar leído"}</button></div>)}</div></div>}
  <div className="mt-6 flex justify-between gap-3"><h4 className="font-semibold">Contenido reciente</h4><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)}/>Mostrar ocultos</label></div>
  <div className="space-y-3 mt-3">{feed?.events.filter(e => showHidden || !e.hidden).map(event => <article key={event.id} className="rounded-xl border border-[#26364e] p-4"><p className="eyebrow">{event.subject} · {labels[event.event_type] || "Contenido"}</p><a className="mt-2 block font-semibold text-blue-300" href={event.external_url} target="_blank" rel="noopener noreferrer">{event.title} ↗</a><p className="muted mt-2 text-sm">{event.due_date ? `Entrega: ${new Date(event.due_date).toLocaleString("es-ES")}` : "Sin fecha de entrega"} · {event.completed ? "Completado" : event.read ? "Leído" : "Pendiente"}</p>{event.description && <p className="muted mt-2 text-sm whitespace-pre-wrap break-words">{event.description.slice(0, 600)}</p>}<div className="flex flex-wrap gap-2 mt-3">{(["read", "completed", "favourite", "hidden"] as const).map(field => <button disabled={busy || disabled} className="secondary text-xs" key={field} onClick={() => request("PATCH", { kind: "event", id: event.id, [field]: !event[field] })}>{field === "read" ? event.read ? "Marcar pendiente" : "Marcar leído" : field === "completed" ? event.completed ? "Desmarcar completado" : "Completar" : field === "favourite" ? event.favourite ? "Quitar favorito" : "Favorito" : event.hidden ? "Mostrar" : "Ocultar"}</button>)}</div><details className="mt-3 text-sm"><summary>Notas personales</summary><form className="mt-2" onSubmit={e => { e.preventDefault(); const notes = new FormData(e.currentTarget).get("notes"); request("PATCH", { kind: "event", id: event.id, personal_notes: notes }); }}><textarea name="notes" aria-label={`Notas de ${event.title}`} maxLength={4000} defaultValue={event.personal_notes} className="w-full"/><button className="secondary mt-2" disabled={busy || disabled}>Guardar notas</button></form></details></article>)}</div>
  {feed && !feed.events.length && <p className="muted mt-4 text-sm">No hay contenido importado disponible. Revisa tus asignaturas y pulsa «Sincronizar ahora».</p>}
  <p className="muted mt-4 text-xs">Se muestran hasta 100 elementos y 30 avisos recientes. El historial completo se conserva. Completar aquí no entrega la tarea en Moodle.</p>
 </div>;
}
