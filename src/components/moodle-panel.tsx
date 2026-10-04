"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { subjects } from "@/lib/data";
import type { MoodleStatus } from "@/lib/moodle/types";
import { MoodleSyncPanel } from "./moodle-sync-panel";
import { academicUpdated } from "@/lib/dashboard-client";

export function MoodlePanel({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<MoodleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/moodle", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se ha podido consultar la conexión.");
      if (!controller.signal.aborted) setStatus(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || "No se ha podido consultar la conexión."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function mutate(method: string, body?: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/moodle", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se ha podido completar la operación.");
      setStatus(data); academicUpdated(); return true;
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "La conexión tarda demasiado. Espera un minuto y vuelve a intentarlo."); return false; }
    finally { setBusy(false); }
  }
  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = { action: "connect", username: String(fields.get("username") || ""), password: String(fields.get("password") || "") };
    // Vaciar inmediatamente el formulario; no guardar credenciales en estado ni localStorage.
    form.reset(); fields.delete("username"); fields.delete("password");
    if (await mutate("POST", body)) { setWizard(false); setMessage("Aula Virtual conectada correctamente. Tus cursos están listos para revisar."); }
    body.username = ""; body.password = "";
  }
  async function disconnect() {
    if (!window.confirm("¿Desconectar Aula Virtual? Se eliminará la conexión guardada en SMR HUB, conservando los datos académicos existentes.")) return;
    if (await mutate("DELETE")) { setWizard(false); setMessage("Aula Virtual desconectada. Tu token ya no está guardado en SMR HUB."); }
  }
  return <section className="panel mb-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">1ºD SMR</p><h2 className="mt-2 text-xl font-semibold">Aula Virtual</h2><p className="muted mt-3 text-sm">{loading ? "Comprobando la conexión…" : status?.connected ? "Tu cuenta está conectada. Revisa las asignaturas de tus cursos." : "Conecta tu cuenta para preparar la sincronización de tareas, avisos y fechas."}</p></div>
      {compact ? <Link className="primary" href="/dashboard/aula-virtual">{status?.connected ? "Gestionar Aula Virtual" : "Conectar Aula Virtual"}</Link> : !loading && status?.configured && <div className="flex flex-wrap gap-2">{status.connected && <button disabled={busy} className="secondary" onClick={async () => { if (await mutate("POST", { action: "refresh" })) setMessage("Cursos actualizados. Los mapeos manuales se han conservado."); }}>Actualizar cursos</button>}<button disabled={busy} className="primary" onClick={() => setWizard(true)}>{status.connected ? "Volver a conectar" : "Conectar Aula Virtual"}</button>{status.connected && <button disabled={busy} className="secondary" onClick={disconnect}>Desconectar Aula Virtual</button>}</div>}
    </div>
    {error && <p role="alert" className="message error mt-5">{error}</p>}{message && <p role="status" className="message mt-5">{message}</p>}
    {!loading && status && !status.configured && <p className="message mt-5">La conexión aún no está habilitada. El administrador debe aplicar la migración de Fase A y configurar las variables del servidor.</p>}
    {!compact && <>
      <p className="muted mt-5 text-xs leading-5">Conecta tu cuenta, revisa las asignaturas y sincroniza manualmente tus tareas y contenidos.</p>
      {wizard && <form onSubmit={connect} className="field-grid mt-6 max-w-xl" autoComplete="off"><h3 className="font-semibold">1. Conecta tu cuenta del centro</h3><p className="muted text-sm">Utiliza tu usuario del Aula Virtual, que puede ser distinto del correo de SMR HUB. Enviaremos los datos únicamente al Aula Virtual indicado abajo. SMR HUB guarda solo una conexión cifrada; no guarda tu contraseña.</p><p className="message break-all text-sm">{status?.site_url}</p><label>Usuario del Aula Virtual<input name="username" required maxLength={256} autoComplete="off" spellCheck={false} autoCapitalize="none" disabled={busy}/></label><label>Contraseña del Aula Virtual<input name="password" type="password" required maxLength={1024} autoComplete="off" disabled={busy}/></label><div className="flex gap-3"><button disabled={busy} className="primary">{busy ? "Validando cuenta y cursos…" : "Conectar de forma segura"}</button><button type="button" disabled={busy} className="secondary" onClick={() => setWizard(false)}>Cancelar</button></div><p className="muted text-xs">Si el centro exige acceso externo, segundo factor o no permite la app de Moodle, esta conexión puede no estar disponible.</p></form>}
      {status?.connected && <div className="mt-7"><h3 className="font-semibold">2. Revisa tus cursos y asignaturas</h3><p className="muted mt-2 mb-5 text-sm">Los cursos no reconocidos quedan sin asociar. Selecciona una de las seis asignaturas o déjalos sin asociar para excluirlos de la sincronización.</p><div className="space-y-4">{status.courses.map(course => <div key={course.course_id} className="rounded-xl border border-[#26364e] p-4 grid gap-3 md:grid-cols-2"><div><p className="font-medium break-words">{course.fullname}</p><p className="muted mt-1 text-xs break-words">{course.shortname} · {course.manual ? "Asignación manual" : course.subject ? "Reconocido automáticamente" : "Pendiente de asignar"}</p></div><label>Asignatura de SMR HUB<select aria-label={`Asignatura de ${course.fullname}`} value={course.subject || ""} disabled={busy} onChange={async e => { if (await mutate("PATCH", { course_id: course.course_id, subject: e.target.value || null })) setMessage("Asignatura guardada."); }}><option value="">Sin asociar</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label></div>)}</div>{!status.courses.length && <p className="message">La cuenta es válida, pero Moodle no ha devuelto cursos. Comprueba que estás matriculado con ese usuario.</p>}<p className="muted mt-5 text-xs">Última consulta de cursos: {status.checked_at ? new Date(status.checked_at).toLocaleString("es-ES") : "Pendiente"}</p></div>}
      {status?.connected && <MoodleSyncPanel revision={JSON.stringify(status)} disabled={busy}/>}
    </>}
  </section>;
}
