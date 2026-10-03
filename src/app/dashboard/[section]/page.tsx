import { notFound } from "next/navigation";
import { PrivatePage } from "@/components/private-page";
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["tareas", "examenes", "enlaces", "herramientas", "asignaturas", "configuracion"].includes(section)) notFound();
  return <PrivatePage section={section}/>;
}
