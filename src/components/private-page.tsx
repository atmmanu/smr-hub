import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { Workspace } from "./workspace";

export async function PrivatePage({ section }: { section: string }) {
  const client = await serverClient();
  const { data: identity, error: authError } = await client.auth.getClaims();
  if (authError || !identity?.claims?.sub) redirect("/login");
  const id = identity.claims.sub;
  const [profile, tasks, exams, links] = await Promise.all([
    client.from("profiles").select("full_name,role").eq("id", id).single(),
    client.from("tasks").select("id,title,subject,due_date,description,completed").eq("user_id", id).order("due_date"),
    client.from("exams").select("id,subject,exam_date,topic,description").eq("user_id", id).order("exam_date"),
    client.from("quick_links").select("id,title,url").eq("user_id", id).order("created_at"),
  ]);
  return <Workspace section={section} userId={id} email={String(identity.claims.email || "")} name={profile.data?.full_name || "Estudiante"} role={profile.data?.role || "user"} initialTasks={tasks.data || []} initialExams={exams.data || []} initialLinks={links.data || []} loadError={Boolean(profile.error || tasks.error || exams.error || links.error)}/>;
}
