# SMR HUB v0.3 — Fase B

Sincronización **manual** de tareas y módulos visibles, eventos compartidos, estado personal y avisos internos en `/dashboard/aula-virtual`. No incluye calendario, correo, cron ni recordatorios; los campos de preferencias se reservan para más adelante.

## Preparación

1. Fase A debe estar aplicada y validada. Haz una copia de seguridad habitual antes de aplicar una migración.
2. Ejecuta **una sola vez** `supabase/migrations/20261004_moodle_phase_b.sql` en el editor SQL de Supabase. Es aditiva; no ejecutes el esquema inicial ni vuelvas a aplicar Fase A. No se ha ejecutado esta migración en la base real desde Codex.
3. Ejecuta `supabase/tests/moodle_phase_b.sql` en el mismo editor. Usa usuarios de prueba con correos `example.invalid`, comprueba comportamiento y permisos y acaba en `ROLLBACK`; no deja datos. Si el editor se detiene en un error, ejecuta `ROLLBACK` antes de volver a probar.
4. No hay variables nuevas. Conserva `SUPABASE_SECRET_KEY`, `MOODLE_BASE_URL` y `MOODLE_TOKEN_ENCRYPTION_KEY` de Fase A, privadas. La clave de cifrado debe coincidir entre entornos si comparten base de datos.
5. Instala las dependencias con `pnpm install` si es necesario. Se añade **solo para tests** `@electric-sql/pglite`, que ejecuta las migraciones y permisos en PostgreSQL en memoria, sin conexiones a Supabase ni Moodle.

## Prueba manual exacta

1. Arranca `pnpm dev --port 3000`, abre `http://localhost:3000`, inicia sesión y entra en `/dashboard/aula-virtual`.
2. Comprueba que la conexión existente sigue funcionando. Revisa el mapeo de las seis asignaturas; los cursos «Sin asociar» se excluyen.
3. Espera un minuto desde la última conexión o actualización de cursos y pulsa **Sincronizar ahora**. Deben aparecer tareas y contenidos, resumen y última sincronización. La primera consulta no genera avisos históricos.
4. Marca una tarea leída, completada, favorita u oculta; guarda una nota. Vuelve a sincronizar tras un minuto. Los estados deben conservarse y no debe haber duplicados ni nuevos avisos si Moodle no cambió.
5. Con un segundo usuario autorizado en los mismos cursos, sincroniza. Debe compartir los eventos comunes, tener estados independientes y no recibir avisos históricos. SQL local ya cubre este caso; no necesitas modificar datos reales para comprobarlo.
6. Cuando un profesor publique o cambie una actividad, sincroniza después de un minuto. Debe aparecer la novedad o actualización y un aviso interno. Los cambios compartidos avisan también a alumnos ya asociados y con acceso; cada alumno detecta nuevas actividades y cambios de sus fechas al sincronizar su cuenta.
7. Marca avisos leídos. Desconecta Aula Virtual: deja de haber acceso a eventos comunes, pero el historial y estado personal se conservan. Re-conectar la misma cuenta recupera su estado tras sincronizar.
8. Comprueba que tareas y exámenes manuales, enlaces y login/logout siguen disponibles. La importación no escribe en sus tablas.

## Endpoints

API SMR HUB: `GET /api/moodle/sync` devuelve resumen/última sincronización y hasta 100 eventos + 30 avisos privados recientes; `POST` sincroniza; `PATCH` cambia únicamente estado propio o lectura de avisos. Todos requieren sesión. Mutaciones requieren `Origin` del mismo origen, sea localhost con cualquier puerto o producción. El endpoint de Fase A `/api/moodle` se conserva.

Moodle usa POST a `webservice/rest/server.php` con:

- `core_webservice_get_site_info`: valida cuenta, sitio y funciones disponibles.
- `core_enrol_get_users_courses`: actualiza matrícula y cursos, conservando mapeos manuales.
- `mod_assign_get_assignments`: tareas de los cursos asociados.
- `core_course_get_contents`: módulos visibles de cada curso asociado.

No se consultan posts de foros, entregas, notas, calificaciones ni APIs externas. `/login/token.php` sigue usándose exclusivamente al conectar, como en Fase A.

## Decisiones de arquitectura

- `client.ts`: transporte Moodle; `academic.ts`: validación y texto plano; `sync.ts`: recopilación reutilizable; `sync-server.ts`: sesión/conexión y acceso; `persistence.ts`: persistencia. La comparación y creación de estados/avisos se ejecutan juntas en `apply_moodle_sync`, dentro de una transacción PostgreSQL. No hay cron ni ejecutor automático.
- Clave única: `(source, moodle_site, external_course_id, external_id)`. Los identificadores usan `assign:<assignment id>` o `module:<cmid>`. Una tarea encontrada también en contenidos no se importa dos veces. Incluir el sitio evita colisiones entre instalaciones Moodle.
- `common_events` guarda metadata compartida y campos temporales reservados. **Las fechas de tareas importadas se guardan en `user_event_state.effective_open_date/effective_due_date`**, y se muestran desde allí. El endpoint Moodle aplica prórrogas individuales antes de devolver fechas; copiarlas al evento común expondría datos privados y cambiaría las entregas de otros alumnos. Por eso `common_events.open_date/due_date` quedan vacíos para estas tareas. Una futura vista deberá usar las fechas efectivas del usuario.
- La primera sincronización completa crea la base inicial por cuenta Moodle y usuario SMR HUB, sin avisos. Cambiar de cuenta Moodle reinicia esta base. Repetir sincronizaciones no duplica estados ni avisos. Cambios sucesivos que vuelven a una fecha anterior generan avisos nuevos mediante una revisión personal monotónica.
- Las novedades se detectan al sincronizar la cuenta. Las actualizaciones compartidas generan avisos para los alumnos ya asociados, con base inicial, conexión vigente y curso mapeado. Al sincronizar después no se duplica ese aviso. Las fechas se comparan y notifican por alumno, no globalmente.
- Locks por conexión y por curso/sitio, restricciones únicas y una transacción evitan duplicación y escrituras parciales. Una conexión o mapeo cambiado durante la importación impide guardar con datos obsoletos. Los contenidos anteriores permanecen si falla una consulta; la fecha de éxito no se actualiza.
- RLS limita eventos a quienes realmente los importaron, siguen conectados a la misma cuenta Moodle y tienen el curso asociado. Los clientes no escriben eventos comunes, fechas efectivas, revisiones ni disponibilidad. Solo actualizan preferencias propias y lectura de sus avisos. Las tablas de conexión y seguimiento son exclusivamente de servidor.
- Un módulo que desaparece marca **solo su disponibilidad para ese alumno** como falsa, conservando datos y notas. No desactiva el evento de toda la clase porque podría tratarse de restricciones de grupo. Las entregas pasadas se conservan.
- Descripciones convertidas a texto y renderizadas como texto React. URLs construidas desde el sitio configurado y un nombre de módulo validado; no se guardan enlaces de descarga Moodle que puedan contener tokens. No hay adjuntos descargables en esta fase.

## Límites de esta versión

- Hasta 12 cursos asociados, 2.000 elementos por snapshot, 8.000 caracteres de descripción y 1 MiB por respuesta Moodle; consultas con concurrencia de dos cursos y presupuesto de 50 segundos. La importación falla con mensaje seguro si el centro limita funciones o devuelve respuestas incompletas. No hay paginación de la lista aún; los registros fuera de los 100 recientes no se borran.
- Detecta foros «Avisos», «Anuncios», «Novedades» o «Announcements» por nombre de módulo; no sincroniza mensajes. Cuestionarios se muestran como cuestionarios, sin inventar fechas de examen. Para recursos se comparan título/descripción/fecha modificada cuando Moodle la proporciona, no los bytes de archivos.
- Los campos recordatorio/correo tienen valores iniciales pero no ejecutan ninguna acción.
- Las pruebas PostgreSQL locales simulan únicamente los componentes básicos de Auth para ejecutar RLS. Además se debe ejecutar el SQL de permisos en el proyecto Supabase y realizar la prueba con la cuenta Moodle real; Codex no ha aplicado cambios ni publicado nada en esos servicios.

## Verificación

`pnpm test` incluye 27 tests correctos: tests existentes, parsing/transporte Moodle y ejecución **sin modificar** de migraciones A/B y pruebas SQL A/B en PostgreSQL aislado. El SQL verifica también una base inicial de 50 tareas sin avisos y rollback de snapshots incompletos. `pnpm typecheck` y `pnpm build` completados correctamente. En el servidor local, GET/POST/PATCH sin sesión devuelven 401, otro origen devuelve 403 y el dashboard sin sesión redirige a login.

La separación de fechas se basa en el comportamiento de [Moodle: mod_assign_get_assignments](https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE/mod/assign/externallib.php), que aplica `update_effective_access` al alumno antes de devolverlas. La herramienta de pruebas se describe en la [documentación oficial de PGlite](https://pglite.dev/docs/).
