import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "SMR HUB · Tu espacio de estudio", description: "Organiza tus tareas, exámenes y herramientas de Sistemas Microinformáticos y Redes." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
