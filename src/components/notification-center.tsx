"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { dashboardFetch, academicUpdated } from "@/lib/dashboard-client";
import { notificationIcons, type NotificationData } from "@/lib/notifications";
import { relativeTime } from "@/lib/calendar";
type Context = { data:NotificationData|null; error:string; refresh:()=>void; mark:(id?:string)=>Promise<void>; busy:boolean };
const Notifications = createContext<Context|null>(null);
export function useNotifications() { const value=useContext(Notifications); if(!value) throw new Error("Notification provider missing"); return value; }
export function NotificationProvider({children}:{children:React.ReactNode}) {
 const [data,setData]=useState<NotificationData|null>(null); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 const sequence=useRef(0);
 const refresh=useCallback(()=>{ const current=++sequence.current; dashboardFetch<NotificationData>("/api/notifications").then(value=>{if(current===sequence.current){setData(value);setError("");}}).catch(e=>{if(current===sequence.current)setError(e.message);}); },[]);
 useEffect(()=>{refresh();window.addEventListener("smr:academic-updated",refresh);return()=>{sequence.current++;window.removeEventListener("smr:academic-updated",refresh);};},[refresh]);
 async function mark(id?:string) {setBusy(true);setError("");try{setData(await dashboardFetch<NotificationData>(id?"/api/notifications":"/api/notifications/read-all",id?"PATCH":"POST",id?{id,read:true}:undefined));academicUpdated();}catch(e){setError(e instanceof Error?e.message:"No se pudo marcar el aviso.");}finally{setBusy(false);}}
 return <Notifications.Provider value={{data,error,refresh,mark,busy}}>{children}</Notifications.Provider>;
}
export function NotificationCenter() {
 const {data,error,refresh,mark,busy}=useNotifications(); const [open,setOpen]=useState(false); const region=useRef<HTMLDivElement>(null);
 useEffect(()=>{ if(!open)return;const outside=(e:PointerEvent)=>{if(!region.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
 return <div ref={region} className="relative flex justify-end mb-5"><button className="secondary gap-2" aria-expanded={open} aria-controls="notification-panel" aria-label={`Notificaciones: ${data?.unread_count || 0} sin leer`} onClick={()=>setOpen(!open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>Notificaciones</span><span className="rounded-full bg-blue-400/20 px-2 text-blue-200">{data?.unread_count || 0}</span></button>
 {open&&<section id="notification-panel" aria-label="Centro de notificaciones" className="notification-popover panel"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Tus notificaciones</h2><button className="small-button" disabled={busy||!data?.unread_count} onClick={()=>mark()}>Marcar todas leídas</button></div><button className="muted text-xs mt-2" onClick={refresh}>Actualizar</button>{error&&<p role="alert" className="message error mt-3">{error}</p>}
 <div className="mt-3 divide-y divide-[#26364e]">{data?.items.map(item=><article key={item.id} className={`py-4 ${item.read?"opacity-70":""}`}><div className="flex gap-3"><span aria-hidden="true">{notificationIcons[item.type]||"📚"}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold break-words">{item.title} {!item.read&&<span className="text-blue-300 text-xs">· Sin leer</span>}</p><p className="muted text-xs mt-1 break-words">{item.subject}</p><p className="text-sm mt-1 break-words">{item.message}</p><time className="muted text-xs" dateTime={item.created_at}>{relativeTime(item.created_at)}</time><div className="flex flex-wrap gap-3 mt-2">{item.href&&<Link className="text-brand text-xs" href={item.href} onClick={()=>{setOpen(false);if(!item.read)void mark(item.id);}}>Abrir evento →</Link>}{!item.read&&<button disabled={busy} className="small-button" onClick={()=>mark(item.id)}>Marcar leída</button>}</div></div></div></article>)}</div>{data&&!data.items.length&&<p className="muted text-sm py-5">No tienes avisos todavía.</p>}{!data&&!error&&<p className="muted py-4 text-sm">Cargando…</p>}</section>}
 </div>;
}
