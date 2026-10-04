"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "./brand";
import { Icon } from "./icon";
import { browserClient } from "@/lib/supabase/client";

const nav = [["", "Inicio", "home"], ["aula-virtual", "Aula Virtual", "chip"], ["calendario", "Calendario", "exams"], ["tareas", "Tareas", "tasks"], ["examenes", "Exámenes", "exams"], ["asignaturas", "Asignaturas", "chip"], ["herramientas", "Herramientas", "tools"], ["enlaces", "Enlaces", "links"], ["configuracion", "Configuración", "settings"]];
export function Sidebar({ name }: { name: string }) {
  const pathname = usePathname(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try { const { error } = await browserClient().auth.signOut(); if (error) throw error; router.push("/login"); router.refresh(); }
    catch { setError("No se ha podido cerrar la sesión. Vuelve a intentarlo."); }
    finally { setBusy(false); }
  }
  return <aside className="border-b border-[#223047] bg-[#0d1523] p-5 lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:flex lg:flex-col"><Brand/><p className="eyebrow mt-10 mb-4 hidden lg:block">1ºD SMR</p><nav className="mt-5 flex gap-2 overflow-x-auto lg:mt-0 lg:flex-col" aria-label="Navegación principal">{nav.map(([slug,label,icon]) => { const href = `/dashboard${slug ? `/${slug}` : ""}`; return <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm ${pathname === href ? "bg-blue-400/10 text-brand" : "text-[#91a3be] hover:bg-[#152136]"}`}><Icon name={icon}/>{label}</Link>; })}</nav><div className="mt-6 lg:mt-auto pt-5 border-t border-[#223047] flex items-center gap-3 flex-wrap"><span className="grid h-9 w-9 place-items-center rounded-full bg-blue-400/10 text-brand">{name.slice(0,1).toUpperCase()}</span><span className="text-sm truncate max-w-32">{name}</span><button className="muted text-xs lg:mt-3 lg:w-full lg:text-left" disabled={busy} onClick={logout}>{busy ? "Cerrando…" : "Cerrar sesión →"}</button>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div></aside>;
}
