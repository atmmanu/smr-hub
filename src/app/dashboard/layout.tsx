import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { NotificationCenter, NotificationProvider } from "@/components/notification-center";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect("/login");
  const client = await serverClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", data.claims.sub).single();
  return <NotificationProvider><div><Sidebar name={profile?.full_name || "Estudiante"}/><main className="px-5 py-8 sm:px-10 lg:ml-64"><div className="mx-auto max-w-6xl"><NotificationCenter/>{children}</div></main></div></NotificationProvider>;
}
