"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { dateLabel, localToday, subjects, type Task, type Exam, type QuickLink } from "@/lib/data";
import { Tools } from "./tools";
import { Icon } from "./icon";

type Props = { section: string; userId: string; email: string; name: string; role: string; initialTasks: Task[]; initialExams: Exam[]; initialLinks: QuickLink[]; loadError: boolean };
type Item = Task | Exam | QuickLink;
const titles: Record<string,string> = { inicio: "Tu día, bajo control.", tareas: "Tareas", examenes: "Exámenes", enlaces: "Tus accesos rápidos", herramientas: "Tu caja de herramientas", asignaturas: "Asignaturas", configuracion: "Configuración" };

export function Workspace(props: Props) {
  const { section, userId } = props; const router = useRouter();
  const [tasks, setTasks] = useState(props.initialTasks); const [exams, setExams] = useState(props.initialExams); const [links, setLinks] = useState(props.initialLinks);
  const [editing, setEditing] = useState<Item | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const table = section === "tareas" ? "tasks" : section === "examenes" ? "exams" : "quick_links";
  const today = localToday(); const pending = tasks.filter(t => !t.completed); const upcoming = exams.filter(e => e.exam_date >= today);
  function replace(items: Item[]) {
    if (table === "tasks") setTasks((items as Task[]).sort((a,b) => a.due_date.localeCompare(b.due_date)));
    else if (table === "exams") setExams((items as Exam[]).sort((a,b) => a.exam_date.localeCompare(b.exam_date)));
    else setLinks(items as QuickLink[]);
  }
  const items: Item[] = section === "tareas" ? tasks : section === "examenes" ? exams : links;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(e.currentTarget); const get = (key: string) => String(form.get(key) || "").trim();
    try {
      if (section === "configuracion") {
        if (!get("name")) throw new Error("Escribe tu nombre.");
        const { error } = await browserClient().from("profiles").update({ full_name: get("name") }).eq("id", userId);
        if (error) throw error; setMessage("Nombre actualizado."); router.refresh(); return;
      }
      let values: Record<string, unknown>;
      if (section === "enlaces") {
        const url = new URL(get("url"));
        if (!["https:","http:"].includes(url.protocol)) throw new Error("Utiliza una dirección que empiece por https:// o http://.");
        if (!get("title")) throw new Error("Escribe un título.");
        values = { title: get("title"), url: url.href };
      } else {
        if (!subjects.includes(get("subject"))) throw new Error("Selecciona una asignatura.");
        values = section === "tareas" ? { title: get("title"), subject: get("subject"), due_date: get("date"), description: get("description") } : { subject: get("subject"), exam_date: get("date"), topic: get("topic"), description: get("description") };
        if (!get("date") || !(section === "tareas" ? get("title") : get("topic"))) throw new Error("Completa todos los campos obligatorios.");
      }
      const client = browserClient();
      const response = editing ? await client.from(table).update(values).eq("id", editing.id).eq("user_id", userId).select().single() : await client.from(table).insert({ ...values, user_id: userId }).select().single();
      if (response.error) throw response.error;
      replace(editing ? items.map(item => item.id === editing.id ? response.data : item) : [...items, response.data]);
      setFormOpen(false); setEditing(null); setMessage("Guardado en tu cuenta."); router.refresh();
    } catch (e) { setError(e instanceof TypeError ? "La dirección del enlace no es válida." : (e as Error).message || "No se ha podido guardar. Revisa la conexión y vuelve a intentarlo."); }
    finally { setBusy(false); }
  }
  async function remove(item: Item) {
    if (!window.confirm("¿Eliminar este elemento? Esta acción no se puede deshacer.")) return;
    setBusy(true); setError(""); setMessage("");
    try { const { data, error } = await browserClient().from(table).delete().eq("id", item.id).eq("user_id", userId).select("id"); if (error || !data?.length) throw new Error("No se ha podido eliminar. Actualiza la página y vuelve a intentarlo."); replace(items.filter(i => i.id !== item.id)); setMessage("Elemento eliminado."); router.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function toggle(task: Task) {
    setBusy(true); setError("");
    try { const { data, error } = await browserClient().from("tasks").update({ completed: !task.completed }).eq("id", task.id).eq("user_id", userId).select().single(); if (error) throw error; setTasks(tasks.map(t => t.id === task.id ? data : t)); router.refresh(); }
    catch { setError("No se ha podido actualizar la tarea. Vuelve a intentarlo."); } finally { setBusy(false); }
  }
  function controls(item: Item) { return <div className="flex gap-2 shrink-0"><button disabled={busy} className="small-button" onClick={() => { setEditing(item); setFormOpen(true); setError(""); }}>Editar</button><button disabled={busy} className="small-button text-red-300" onClick={() => remove(item)}>Eliminar</button></div>; }
  function taskRow(task: Task, editable = false) { return <div key={task.id} className="flex flex-wrap items-center gap-4 border-b border-[#223047] py-4 last:border-0"><input type="checkbox" aria-label={`Completar ${task.title}`} checked={task.completed} disabled={busy} onChange={() => toggle(task)}/><div className="min-w-0 flex-1"><p className={task.completed ? "line-through muted" : "font-medium"}>{task.title}</p><p className="muted text-xs mt-1">{task.subject} · <span className={!task.completed && task.due_date < today ? "text-amber-300" : ""}>{dateLabel(task.due_date)}{!task.completed && task.due_date < today ? " · Vencida" : ""}</span></p>{editable && task.description && <p className="muted text-sm mt-2 whitespace-pre-wrap break-words">{task.description}</p>}</div>{editable && controls(task)}</div>; }
  return <>
    <header className="mb-8 flex flex-wrap justify-between gap-4 items-end"><div><p className="eyebrow">{section === "inicio" ? `Hola, ${props.name}` : "Tu espacio personal"}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{titles[section]}</h1><p className="muted mt-3 text-sm">{section === "inicio" ? "Un poco de organización. Mucho más espacio para aprender." : section === "tareas" ? "Lo pendiente hoy, el progreso de mañana." : section === "examenes" ? "Prepara cada unidad con tiempo." : section === "enlaces" ? "Todo lo que usas en clase, a un clic." : "Pensado para el día a día de 1ºD SMR."}</p></div>{["tareas","examenes","enlaces"].includes(section) && <button disabled={busy} className="primary" onClick={() => { setEditing(null); setFormOpen(true); setError(""); }}>+ {section === "tareas" ? "Nueva tarea" : section === "examenes" ? "Nuevo examen" : "Nuevo enlace"}</button>}</header>
    {props.loadError && <p className="message error mb-6" role="alert">No se han podido cargar todos los datos. Comprueba que has ejecutado el SQL de Supabase y que tienes conexión. Recarga la página antes de continuar.</p>}
    {error && <p role="alert" className="message error mb-6">{error}</p>}{message && <p role="status" className="message mb-6">{message}</p>}
    {section === "inicio" && <><div className="grid gap-5 sm:grid-cols-3 mb-7">{[["tasks","Tareas pendientes",pending.length],["exams","Próximos exámenes",upcoming.length],["links","Accesos rápidos",links.length]].map(([icon,label,count]) => <div className="panel" key={String(label)}><div className="flex justify-between muted text-sm"><span>{label}</span><Icon name={String(icon)}/></div><p className="text-4xl font-semibold mt-5">{count}</p></div>)}</div><div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><section className="panel"><div className="flex justify-between gap-4 mb-3"><h2 className="font-semibold text-lg">Próximas tareas</h2><Link className="text-brand text-sm" href="/dashboard/tareas">Ver todas →</Link></div>{pending.length ? pending.slice(0,5).map(t => taskRow(t)) : <Empty text="Sin tareas pendientes. Añade tu próxima entrega para empezar." href="/dashboard/tareas"/>}</section><section className="panel"><h2 className="font-semibold text-lg mb-3">Lo que se viene</h2>{upcoming.length ? upcoming.slice(0,4).map(e => <div key={e.id} className="flex gap-4 py-4 border-b border-[#223047] last:border-0"><span className="rounded-lg bg-blue-400/10 p-3 text-brand text-sm shrink-0">{dateLabel(e.exam_date)}</span><div><h3>{e.subject}</h3><p className="muted text-sm mt-1">{e.topic}</p></div></div>) : <Empty text="Tus próximos exámenes aparecerán aquí." href="/dashboard/examenes"/>}</section><section className="panel"><h2 className="font-semibold text-lg mb-5">Tus accesos rápidos</h2>{links.length ? <div className="flex flex-wrap gap-3">{links.map(l => <a className="secondary" key={l.id} href={l.url} target="_blank" rel="noopener noreferrer">{l.title} ↗</a>)}</div> : <Empty text="Guarda Aula Virtual, EducaMadrid, Raíces, Drive o NotebookLM con la dirección que utilices." href="/dashboard/enlaces"/>}</section><section className="panel bg-gradient-to-br from-[#192e50] to-[#111b2b]"><p className="eyebrow">Una duda menos</p><h2 className="text-xl font-semibold mt-4">Tus herramientas, siempre a mano.</h2><p className="muted text-sm mt-3 mb-6">Bases numéricas, almacenamiento y redes IPv4 e IPv6.</p><Link className="secondary" href="/dashboard/herramientas">Abrir herramientas →</Link></section></div></>}
    {formOpen && <section className="panel mb-6"><h2 className="text-xl font-semibold mb-6">{editing ? "Editar" : "Añadir"} {section === "tareas" ? "tarea" : section === "examenes" ? "examen" : "enlace"}</h2><form key={editing?.id || "new"} onSubmit={save} className="field-grid sm:grid-cols-2">{section === "enlaces" ? <><label>Título<input name="title" required maxLength={120} defaultValue={(editing as QuickLink)?.title}/></label><label>Dirección web<input name="url" type="url" required maxLength={2048} placeholder="https://…" defaultValue={(editing as QuickLink)?.url}/></label></> : <>{section === "tareas" ? <label>Título<input name="title" required maxLength={160} defaultValue={(editing as Task)?.title}/></label> : <label>Tema o unidad<input name="topic" required maxLength={160} defaultValue={(editing as Exam)?.topic}/></label>}<label>Asignatura<select name="subject" required defaultValue={editing ? (subjects.includes((editing as Task | Exam).subject) ? (editing as Task | Exam).subject : "") : subjects[0]}><option value="" disabled>Selecciona una asignatura</option>{subjects.map(s => <option key={s}>{s}</option>)}</select>{editing && !subjects.includes((editing as Task | Exam).subject) && <span className="mt-2 block text-xs text-amber-300">Este registro utiliza una asignatura del listado anterior. Elige una de las seis actuales para guardar los cambios.</span>}</label><label>Fecha<input name="date" type="date" required min="1900-01-01" max="9999-12-31" defaultValue={section === "tareas" ? (editing as Task)?.due_date : (editing as Exam)?.exam_date}/></label><label className="sm:col-span-2">Descripción opcional<textarea name="description" maxLength={4000} defaultValue={(editing as Task | Exam)?.description}/></label></>}<div className="flex gap-3 sm:col-span-2"><button disabled={busy} className="primary">{busy ? "Guardando…" : "Guardar"}</button><button type="button" disabled={busy} className="secondary" onClick={() => setFormOpen(false)}>Cancelar</button></div></form></section>}
    {section === "tareas" && <section className="panel">{tasks.length ? tasks.map(t => taskRow(t,true)) : <Empty text="Todavía no tienes tareas. Crea la primera con el botón Nueva tarea."/>}</section>}
    {section === "examenes" && <div className="grid gap-5 md:grid-cols-2">{exams.length ? exams.map(e => <section key={e.id} className="panel"><p className="eyebrow">{dateLabel(e.exam_date)}{e.exam_date < today ? " · Pasado" : ""}</p><h2 className="text-xl font-semibold mt-4">{e.subject}</h2><p className="mt-2">{e.topic}</p>{e.description && <p className="muted text-sm mt-4 whitespace-pre-wrap break-words">{e.description}</p>}<div className="mt-6">{controls(e)}</div></section>) : <div className="panel md:col-span-2"><Empty text="Añade tu primer examen para planificar el repaso."/></div>}</div>}
    {section === "enlaces" && <div className="grid gap-5 md:grid-cols-2">{links.length ? links.map(l => <section key={l.id} className="panel"><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand font-semibold text-lg">{l.title} ↗</a><p className="muted text-xs mt-3 mb-5 break-all">{l.url}</p>{controls(l)}</section>) : <div className="panel md:col-span-2"><Empty text="Añade tus enlaces de clase. Utiliza las direcciones oficiales que te facilite tu centro."/></div>}</div>}
    {section === "herramientas" && <Tools/>}
    {section === "asignaturas" && <><p className="message mb-6">Las seis asignaturas de 1ºD de Sistemas Microinformáticos y Redes.</p><div className="grid gap-4 md:grid-cols-2">{subjects.map((s,i) => <div key={s} className="panel flex items-center gap-4"><span className="text-brand font-mono text-sm">{String(i+1).padStart(2,"0")}</span>{s}</div>)}</div></>}
    {section === "configuracion" && <section className="panel max-w-xl"><h2 className="text-lg font-semibold mb-6">Mi perfil</h2><form onSubmit={save} className="field-grid"><label>Nombre<input key={props.name} name="name" defaultValue={props.name} required maxLength={80}/></label><p className="muted text-sm">Correo: {props.email}</p><p className="muted text-sm">Rol: {props.role === "admin" ? "Administrador" : "Usuario"}</p><button disabled={busy} className="primary">{busy ? "Guardando…" : "Guardar nombre"}</button></form><p className="muted mt-6 text-xs leading-5">Tus tareas, exámenes y enlaces son privados y se guardan en Supabase. Los roles se asignan desde la base de datos; esta pantalla no permite cambiarlos.</p></section>}
  </>;
}
function Empty({ text, href }: { text: string; href?: string }) { return <div className="py-8"><p className="muted text-sm leading-6">{text}</p>{href && <Link href={href} className="mt-4 inline-block text-brand text-sm">Empezar →</Link>}</div>; }
