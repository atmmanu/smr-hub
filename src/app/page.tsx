import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { subjects } from "@/lib/data";

export default function Home() {
  return <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-6">
    <header className="flex items-center justify-between border-b border-[#223047] py-5"><Brand/><span className="eyebrow">1ºD SMR</span></header>
    <main className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="relative mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-blue-400/30 bg-blue-400/10 text-brand"><span className="pointer-events-none absolute -inset-10 rounded-full bg-blue-500/10 blur-3xl"/><Icon name="chip"/></div>
      <p className="eyebrow mb-4">1ºD de Sistemas Microinformáticos y Redes</p>
      <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">El espacio de <span className="text-brand">1ºD SMR</span></h1>
      <p className="muted mt-5 max-w-lg text-base leading-7">Tareas, exámenes, herramientas y recursos de clase en un solo sitio.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/login" className="primary">Iniciar sesión <Icon name="arrow"/></Link><Link href="/registro" className="secondary">Crear cuenta</Link></div>
      <ul aria-label="Asignaturas de 1ºD SMR" className="mt-9 flex max-w-3xl flex-wrap justify-center gap-2">{subjects.map(subject => <li key={subject} className="rounded-lg border border-[#223047] bg-[#111b2b] px-3 py-2 text-xs text-[#91a3be]">{subject}</li>)}</ul>
    </main>
    <footer className="border-t border-[#223047] py-4 text-center text-xs muted">SMR HUB · 1ºD SMR</footer>
  </div>;
}
