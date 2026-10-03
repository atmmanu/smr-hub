"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient, isConfigured } from "@/lib/supabase/client";

export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    try {
      const client = browserClient();
      const response = register ? await client.auth.signUp({ email, password, options: { data: { full_name: String(form.get("name")).trim() }, emailRedirectTo: `${window.location.origin}/auth/confirm` } }) : await client.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      if (register && !response.data.session) setMessage("Revisa tu correo y confirma la cuenta antes de iniciar sesión. Si ya existe una cuenta, utiliza Iniciar sesión.");
      else { router.push("/dashboard"); router.refresh(); }
    } catch { setFailed(true); setMessage(register ? "No se ha podido crear la cuenta. Revisa los datos y la configuración de correo de Supabase, o inténtalo más tarde." : "No se ha podido iniciar sesión. Revisa el correo, la contraseña y si has confirmado la cuenta."); }
    finally { setBusy(false); }
  }
  const configured = isConfigured();
  return <div className="panel w-full max-w-md"><p className="eyebrow">Tu espacio personal</p><h1 className="text-3xl font-semibold mt-3">{register ? "Empieza con buen pie." : "Qué bueno verte."}</h1><p className="muted mt-3 mb-7 text-sm">{register ? "Crea tu cuenta y organiza tu día a día." : "Entra para continuar donde lo dejaste."}</p>{!configured && <p className="message mb-6">Falta conectar Supabase. Sigue los pasos del README y configura las variables de entorno.</p>}<form onSubmit={submit} className="field-grid">{register && <label>Tu nombre<input name="name" required minLength={1} maxLength={80} autoComplete="name"/></label>}<label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><label>Contraseña<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={register ? "new-password" : "current-password"}/></label>{register && <p className="muted text-xs">Utiliza al menos 8 caracteres. Tu contraseña la gestiona Supabase Auth.</p>}<button className="primary" disabled={busy || !configured}>{busy ? "Un momento…" : register ? "Crear cuenta" : "Iniciar sesión"}</button>{message && <p role="status" className={`message ${failed ? "error" : ""}`}>{message}</p>}</form><p className="muted mt-6 text-sm">{register ? "¿Ya tienes cuenta? " : "¿Primera vez por aquí? "}<Link href={register ? "/login" : "/registro"} className="text-brand">{register ? "Inicia sesión" : "Crea tu cuenta"}</Link></p></div>;
}
