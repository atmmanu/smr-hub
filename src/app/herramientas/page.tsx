import Link from "next/link";
import { Brand } from "@/components/brand";
import { Tools } from "@/components/tools";
export default function ToolsPage() {
  return <div className="mx-auto max-w-6xl px-6"><header className="flex items-center justify-between py-6 border-b border-[#223047]"><Brand/><Link href="/dashboard" className="secondary">Mi espacio</Link></header><main className="py-12"><p className="eyebrow">Sin iniciar sesión</p><h1 className="mt-3 text-3xl font-semibold">Tu caja de herramientas</h1><p className="muted mt-3 mb-8">Utilidades pequeñas para resolver grandes dudas.</p><Tools/></main></div>;
}
