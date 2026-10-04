import { MoodleError } from "./types.ts";
import { parseCourses } from "./mapping.ts";

export function validateMoodleUrl(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new MoodleError("configuration", "El administrador debe configurar la URL del Aula Virtual.", 503); }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".educa.madrid.org") || url.port || url.username || url.password || url.search || url.hash || /%(?:2e|2f|5c)/i.test(url.pathname))
    throw new MoodleError("configuration", "Configura una URL HTTPS oficial de EducaMadrid, sin credenciales ni parámetros.", 503);
  return url.href.replace(/\/+$/, "");
}

function moodleFailure(code: unknown): MoodleError {
  if (code === "invalidlogin") return new MoodleError("invalid_login", "Aula Virtual no acepta ese usuario o contraseña. Compruébalos y vuelve a intentarlo.");
  if (["servicenotavailable", "webservicesdisabled", "enablewsdescription", "wsaccessuser", "accessexception", "requirecorrectaccess"].includes(String(code)))
    return new MoodleError("service_unavailable", "El centro no permite este acceso con la app de Moodle. Consulta al administrador del Aula Virtual.");
  if (code === "invalidtoken") return new MoodleError("invalid_token", "La conexión ha caducado o no es válida. Vuelve a conectar Aula Virtual.");
  return new MoodleError("moodle_error", "Aula Virtual no ha podido completar la petición. Revisa que tu cuenta pueda usar la app de Moodle.");
}

export function moodleClient(baseUrl: string, fetcher: typeof fetch = fetch) {
  const base = validateMoodleUrl(baseUrl);
  async function post(path: string, fields: Record<string, string>): Promise<unknown> {
    try {
      const response = await fetcher(`${base}/${path}`, { method: "POST", body: new URLSearchParams(fields), headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!response.ok || !response.body) throw new MoodleError("unavailable", "Aula Virtual no responde correctamente. Inténtalo más tarde.", 502);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1_048_576) { await reader.cancel(); throw new MoodleError("response_limit", "La respuesta del Aula Virtual supera el tamaño permitido.", 502); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (data && !Array.isArray(data) && (data.error || data.exception || data.errorcode)) throw moodleFailure(data.errorcode);
      return data;
    } catch (error) {
      if (error instanceof MoodleError) throw error;
      throw new MoodleError("unavailable", "No se puede conectar con Aula Virtual. Revisa el servicio o inténtalo más tarde.", 502);
    }
  }
  function call(token: string, name: string, fields: Record<string, string> = {}) {
    return post("webservice/rest/server.php", { ...fields, wstoken: token, wsfunction: name, moodlewsrestformat: "json" });
  }
  async function inspect(token: string) {
    const info = await call(token, "core_webservice_get_site_info") as { userid?: unknown; siteurl?: unknown; functions?: unknown };
    if (!info || !Number.isSafeInteger(info.userid) || Number(info.userid) <= 0 || typeof info.siteurl !== "string" || validateMoodleUrl(info.siteurl) !== base)
      throw new MoodleError("invalid_site", "La respuesta no pertenece al Aula Virtual configurado.");
    if (!Array.isArray(info.functions) || !info.functions.some(f => f?.name === "core_enrol_get_users_courses"))
      throw new MoodleError("course_access", "Tu cuenta no permite consultar cursos desde la app de Moodle. Consulta con el centro.");
    const courses = parseCourses(await call(token, "core_enrol_get_users_courses", { userid: String(info.userid) }));
    return { moodleUserId: Number(info.userid), courses, functions: info.functions.map(f => String(f?.name || "")) };
  }
  return {
    inspect,
    assignments(token: string, courseIds: number[]) {
      return call(token, "mod_assign_get_assignments", Object.fromEntries(courseIds.map((id, index) => [`courseids[${index}]`, String(id)])));
    },
    contents(token: string, courseId: number) {
      return call(token, "core_course_get_contents", { courseid: String(courseId) });
    },
    async connect(username: string, password: string) {
      const data = await post("login/token.php", { username, password, service: "moodle_mobile_app" }) as { token?: unknown };
      if (!data || typeof data.token !== "string" || !/^[a-zA-Z0-9_-]{16,512}$/.test(data.token)) throw new MoodleError("invalid_token", "Aula Virtual no ha devuelto una conexión válida.");
      return { token: data.token, ...await inspect(data.token) };
    },
  };
}
