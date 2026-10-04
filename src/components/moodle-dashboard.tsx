"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardFetch,academicUpdated } from "@/lib/dashboard-client";
import type {MoodleStatus} from "@/lib/moodle/types";
import type {AcademicFeed,SyncSummary} from "@/lib/moodle/academic-types";
import {relativeTime} from "@/lib/calendar";
import {useNotifications} from "./notification-center";
export function MoodleDashboard() {
 const [status,setStatus]=useState<MoodleStatus|null>(null); const [feed,setFeed]=useState<AcademicFeed|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState(""); const sequence=useRef(0);
 const {data:notifications}=useNotifications();
 const load=useCallback(()=>{const current=++sequence.current;Promise.all([dashboardFetch<MoodleStatus>("/api/moodle"),dashboardFetch<AcademicFeed>("/api/moodle/sync")]).then(([s,f])=>{if(current===sequence.current){setStatus(s);setFeed(f);setError("");}}).catch(e=>{if(current===sequence.current)setError(e.message);});},[]);
 useEffect(()=>{load();window.addEventListener("smr:academic-updated",load);return()=>{sequence.current++;window.removeEventListener("smr:academic-updated",load);};},[load]);
 async function sync(){setBusy(true);setError("");setMessage("");try{const result=await dashboardFetch<{summary:SyncSummary;feed:AcademicFeed}>("/api/moodle/sync","POST");setFeed(result.feed);setMessage(`${result.summary.tasks} tareas · ${result.summary.resources} contenidos · ${result.summary.updates} actualizaciones${result.summary.first_sync?". Histórico importado sin avisos.":"."}`);academicUpdated();}catch(e){setError(e instanceof Error?e.message:"No se pudo sincronizar.");}finally{setBusy(false);}}
 return <section className="panel mb-6 bg-gradient-to-br from-[#142641] to-[#111b2b]"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-lg font-semibold">Aula Virtual</h2><p className="muted text-sm mt-2">{status?status.connected?"✓ Conectada":"Sin conectar":"Comprobando conexión…"}</p><p className="muted text-xs mt-1">Última sincronización: {feed?.last_synced_at?relativeTime(feed.last_synced_at):"Pendiente"}</p></div><span className="text-blue-200 text-sm">{notifications?.unread_count||0} novedades sin leer</span></div>
 {!!notifications?.items.length&&<ul className="mt-4 space-y-2">{notifications.items.filter(n=>!n.read).slice(0,3).map(n=><li key={n.id} className="text-sm break-words">{n.href?<Link className="text-blue-200" href={n.href}>{n.message} · {n.title}</Link>:<span>{n.message}</span>}</li>)}</ul>}
 {!notifications?.items.some(n=>!n.read)&&feed?.events.filter(e=>!e.hidden).slice(0,2).map(e=><p key={e.id} className="mt-3 text-sm break-words"><Link href={`/dashboard/calendario?source=moodle&event=${e.id}`}>{e.subject} · {e.title}</Link></p>)}
 {error&&<p className="message error mt-3" role="alert">{error}</p>}{message&&<p role="status" className="message mt-3 text-sm">{message}</p>}
 <div className="flex flex-wrap gap-3 mt-5"><Link className="secondary" href="/dashboard/aula-virtual">Ver Aula Virtual →</Link><button className="primary" disabled={busy||!status?.connected} onClick={sync}>{busy?"Sincronizando…":"Sincronizar ahora"}</button></div></section>;
}
