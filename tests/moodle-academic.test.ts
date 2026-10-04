import test from "node:test";
import assert from "node:assert/strict";
import { academicSnapshot, plainText } from "../src/lib/moodle/academic.ts";
import { collectAcademicEvents } from "../src/lib/moodle/sync.ts";
import { moodleClient } from "../src/lib/moodle/client.ts";
import { subjects } from "../src/lib/data.ts";
const site = "https://test.educa.madrid.org";
const courses = [{ course_id: 4, fullname: "Redes", shortname: "RL", subject: subjects[0], manual: false }];
const task = { id: 8, cmid: 18, course: 4, name: "<b>IPv6</b>", intro: '<p>Estudiar &amp; practicar</p><script>alert(1)</script>', duedate: 2000000000, allowsubmissionsfromdate: 1900000000, timemodified: 1800000000 };
const assignments = { courses: [{ id: 4, assignments: [task] }], warnings: [] };
const sections = [{ modules: [{ id: 18, modname: "assign", name: "IPv6" }, { id: 19, modname: "resource", name: "PDF", description: '<img onerror="attack()">Resumen', url: 'https://evil.invalid/?wstoken=secret' }, { id: 20, modname: "forum", name: "Avisos" }] }];
test("Fase B: importa tareas completas, recursos y foro Avisos sin duplicar assign", () => {
 const events = academicSnapshot(site, courses, assignments, new Map([[4, sections]]));
 assert.equal(events.length, 3); assert.equal(events[0].external_id, "assign:8"); assert.equal(events[0].cmid, 18);
 assert.equal(events[0].subject, subjects[0]); assert.equal(events[0].title, "IPv6"); assert.equal(events[0].description, "Estudiar & practicar");
 assert.equal(events[0].due_date, new Date(2000000000 * 1000).toISOString());
 assert.equal(events[1].event_type, "resource"); assert.equal(events[2].event_type, "announcement");
 assert.equal(events[1].external_url, `${site}/mod/resource/view.php?id=19`); assert.ok(!JSON.stringify(events).includes("secret"));
});
test("Fase B: ignora cursos sin mapear y módulos ocultos", () => {
 assert.deepEqual(academicSnapshot(site, [{ ...courses[0], subject: null }], assignments, new Map()), []);
 const content = [{ modules: [{ id: 19, name: "Oculto", modname: "resource", uservisible: false }] }];
 assert.deepEqual(academicSnapshot(site, courses, assignments, new Map([[4, content]])), []);
 assert.deepEqual(academicSnapshot(site, courses, { ...assignments, warnings: [{ item: "module", itemid: 18, warningcode: "1" }] }, new Map([[4, content]])), []);
});
test("Fase B: rechaza respuestas parciales, IDs inválidos y duplicados", () => {
 const run = (data: unknown) => academicSnapshot(site, courses, data, new Map([[4, sections]]));
 for (const data of [null, { courses: [], warnings: [] }, { ...assignments, warnings: [{ item: "course" }] }, { courses: [{ id: 4, assignments: [{ ...task, id: -1 }] }], warnings: [] }, { courses: [{ id: 4, assignments: [task, task] }], warnings: [] }]) assert.throws(() => run(data));
 assert.throws(() => plainText("x".repeat(100001)));
});
test("Fase B: texto seguro, entidades y límites sin interpretar HTML", () => {
 assert.equal(plainText('<style>evil</style><iframe>evil</iframe><p>&#65; &#x42; &quot;hola&quot;</p>'), 'A B "hola"');
 assert.equal(plainText("abcdef", 3), "abc"); assert.equal(plainText(undefined), "");
 // Decoded markup remains plain text; the React view never uses dangerouslySetInnerHTML.
 assert.equal(plainText("&lt;script&gt;texto&lt;/script&gt;"), "<script>texto</script>");
});
test("Fase B: cliente solicita las dos funciones con cursos explícitos, sin llamadas públicas", async () => {
 const calls: string[] = [];
 const client = moodleClient(site, async (_input, init) => { const fields = new URLSearchParams(init?.body as URLSearchParams); const fn = fields.get("wsfunction")!; calls.push(fn); assert.equal(fields.get("wstoken"), "a".repeat(32)); if (fn === "mod_assign_get_assignments") { assert.equal(fields.get("courseids[0]"), "4"); return Response.json(assignments); } assert.equal(fields.get("courseid"), "4"); return Response.json(sections); });
 const events = await collectAcademicEvents(client, "a".repeat(32), site, [...courses, { ...courses[0], course_id: 9, subject: null }]);
 assert.equal(events.length, 3); assert.deepEqual(calls, ["mod_assign_get_assignments", "core_course_get_contents"]);
});
test("Fase B: fallo de un curso impide entregar un snapshot parcial a persistencia", async () => {
 await assert.rejects(collectAcademicEvents({ assignments: async () => assignments, contents: async () => { throw new Error("offline"); } }, "token", site, courses), /offline/);
 await assert.rejects(collectAcademicEvents({ assignments: async () => assignments, contents: async () => sections }, "token", site, []), /Asocia/);
});
