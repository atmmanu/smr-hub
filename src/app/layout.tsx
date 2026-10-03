import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "SMR HUB · 1ºD SMR", description: "El espacio de 1ºD de Sistemas Microinformáticos y Redes: tareas, exámenes, herramientas y recursos de clase." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
