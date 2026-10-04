import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mapCourse, parseCourses } from "../src/lib/moodle/mapping.ts";
import { moodleClient, validateMoodleUrl } from "../src/lib/moodle/client.ts";
import { encryptionKey, encryptToken, decryptToken } from "../src/lib/moodle/crypto.ts";
import { assertSameOrigin, readMoodleRequest } from "../src/lib/moodle/request.ts";
import { subjects } from "../src/lib/data.ts";

const url = "https://aulavirtual34.educa.madrid.org/ies.jovellanos.fuenlabrada";
const token = "a".repeat(32);
const user = "10000000-0000-0000-0000-000000000001";

test("Moodle: reconoce los seis nombres reales y shortnames sin depender del ID", () => {
  const names = ["SMR1D-Redes Locales 26-27", "26-27. Montaje y Mantenimiento de Equipos – 1.º SMR D", "SMR1D y 1B_SOM_26_27", "AplicacionesOfimáticas_smr1_2627", "26-27. SMR1D - IPE I", "26-27. Fundamentos de programación (1SMR-D)"];
  names.forEach((name, i) => assert.equal(mapCourse(name, ""), subjects[i]));
  assert.equal(mapCourse("Curso de clase", "SMR_D_SOM"), subjects[2]);
  assert.equal(mapCourse("PROGRAMACIÓN EN PYTHON", ""), subjects[5]);
  assert.equal(mapCourse("Tutoría", "SMR1D"), null);
  assert.equal(mapCourse("Redes Locales y Montaje y Mantenimiento", ""), null);
  assert.equal(mapCourse("SOM", "IPE"), null);
});

test("Moodle: parsing limitado, sin datos adicionales y sin IDs duplicados", () => {
  const parsed = parseCourses([{ id: 1698, fullname: "Redes Locales", shortname: "RL", token, username: "no-conservar", summary: "<script>no</script>" }]);
  assert.deepEqual(parsed, [{ course_id: 1698, fullname: "Redes Locales", shortname: "RL", subject: subjects[0], manual: false }]);
  assert.ok(!JSON.stringify(parsed).includes(token));
  const course = { id: 1, fullname: "Redes Locales", shortname: "RL" };
  for (const data of [null, {}, [{ ...course, id: -1 }], [course, course], [{ ...course, fullname: "x".repeat(321) }], Array.from({ length: 201 }, (_, id) => ({ ...course, id: id + 1 }))]) assert.throws(() => parseCourses(data));
});

test("Moodle: cifrado autenticado, aleatorio y vinculado al dueño", () => {
  const key = encryptionKey(randomBytes(32).toString("base64"));
  const ciphertext = encryptToken(token, user, key);
  assert.ok(!ciphertext.includes(token));
  assert.equal(decryptToken(ciphertext, user, key), token);
  assert.notEqual(encryptToken(token, user, key), ciphertext);
  assert.throws(() => decryptToken(ciphertext, "otro-usuario", key));
  assert.throws(() => decryptToken(ciphertext, user, randomBytes(32)));
  const parts = ciphertext.split(".");
  const data = Buffer.from(parts[3], "base64"); data[0] ^= 1; parts[3] = data.toString("base64");
  assert.throws(() => decryptToken(parts.join("."), user, key));
  assert.throws(() => encryptionKey("clave-corta"));
  assert.throws(() => encryptionKey(randomBytes(31).toString("base64")));
  assert.throws(() => encryptToken("", user, key));
});

test("Moodle: solo URL HTTPS oficial fija, sin credenciales ni redirecciones", () => {
  assert.equal(validateMoodleUrl(`${url}/`), url);
  for (const invalid of ["http://aulavirtual34.educa.madrid.org", "https://127.0.0.1", "https://aulavirtual34.educa.madrid.org.evil.example", "https://user:pass@aulavirtual34.educa.madrid.org", `${url}?wstoken=secret`, `${url}#fragment`, "https://aulavirtual34.educa.madrid.org:8443", `${url}/%2fsecret`]) assert.throws(() => validateMoodleUrl(invalid));
});

test("Moodle: conexión POST, validación del token y cursos del usuario real", async () => {
  const calls: { path: string; fields: URLSearchParams }[] = [];
  const fakeFetch: typeof fetch = async (input, options) => {
    const endpoint = new URL(String(input));
    assert.equal(endpoint.search, "");
    assert.equal(endpoint.origin, new URL(url).origin);
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    const fields = new URLSearchParams(options?.body as URLSearchParams);
    calls.push({ path: endpoint.pathname, fields });
    if (endpoint.pathname.endsWith("/login/token.php")) {
      assert.equal(fields.get("service"), "moodle_mobile_app");
      assert.equal(fields.get("username"), "alumno");
      assert.equal(fields.get("password"), "contraseña-simulada");
      return Response.json({ token, privatetoken: "no-conservar" });
    }
    assert.equal(fields.get("wstoken"), token);
    assert.equal(fields.has("password"), false);
    assert.equal(fields.has("username"), false);
    if (fields.get("wsfunction") === "core_webservice_get_site_info") return Response.json({ userid: 42, siteurl: `${url}/`, functions: [{ name: "core_enrol_get_users_courses" }] });
    assert.equal(fields.get("wsfunction"), "core_enrol_get_users_courses");
    assert.equal(fields.get("userid"), "42");
    return Response.json([{ id: 99, fullname: "SMR1D-SOM", shortname: "SOM" }]);
  };
  const result = await moodleClient(url, fakeFetch).connect("alumno", "contraseña-simulada");
  assert.equal(calls.length, 3);
  assert.equal(result.moodleUserId, 42);
  assert.equal(result.courses[0].subject, subjects[2]);
  assert.equal(Object.hasOwn(result, "privatetoken"), false);
});

test("Moodle: errores externos no filtran token ni contraseña", async () => {
  for (const code of ["invalidlogin", "invalidtoken", "webservicesdisabled", "exception-desconocida"]) {
    const client = moodleClient(url, async () => Response.json({ error: `detalle privado ${token}`, errorcode: code, debuginfo: "contraseña" }));
    await assert.rejects(client.connect("alumno", "contraseña"), error => error instanceof Error && !error.message.includes(token) && !error.message.includes("detalle privado"));
  }
  await assert.rejects(moodleClient(url, async () => { throw new Error(`fallo privado ${token}`); }).connect("alumno", "contraseña"), /No se puede conectar/);
  await assert.rejects(moodleClient(url, async () => new Response("<html>login</html>")).connect("alumno", "contraseña"), /No se puede conectar/);
});

test("Moodle: rechaza sitios diferentes, funciones ausentes y respuestas grandes", async () => {
  for (const info of [{ userid: 42, siteurl: "https://otro.educa.madrid.org" }, { userid: 42, siteurl: url, functions: [] }, { userid: 0, siteurl: url }])
    await assert.rejects(moodleClient(url, async () => Response.json(info)).inspect(token));
  await assert.rejects(moodleClient(url, async () => new Response("x".repeat(1_048_577))).inspect(token), /tamaño permitido/);
});

test("Moodle: protección de origen conserva cualquier puerto local y producción", () => {
  for (const origin of ["http://localhost:3000", "http://localhost:3001", "http://localhost:4312", "https://smrhub.vercel.app"])
    assert.doesNotThrow(() => assertSameOrigin(new Request(`${origin}/api/moodle`, { headers: { origin } })));
  assert.throws(() => assertSameOrigin(new Request("http://localhost:3001/api/moodle", { headers: { origin: "http://localhost:3000" } })));
  assert.throws(() => assertSameOrigin(new Request("https://smrhub.vercel.app/api/moodle", { headers: { origin: "https://evil.example" } })));
  assert.throws(() => assertSameOrigin(new Request("https://smrhub.vercel.app/api/moodle")));
});

test("Moodle: valida JSON y limita el tamaño de credenciales recibidas", async () => {
  const request = (value: string) => new Request(`${url}/api`, { method: "POST", headers: { "Content-Type": "application/json" }, body: value });
  assert.deepEqual(await readMoodleRequest(request('{"action":"refresh"}')), { action: "refresh" });
  for (const value of ["[]", "null", "no-json", JSON.stringify({ password: "x".repeat(9000) })]) await assert.rejects(readMoodleRequest(request(value)));
});
