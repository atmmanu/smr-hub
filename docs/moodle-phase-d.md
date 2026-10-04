# SMR HUB v0.3 — Fase D

Preparada para revisión. **No se ha aplicado SQL en el proyecto real, asignado el rol real, activado cron, enviado email real, hecho commit/push ni desplegado.** Las migraciones A/B/C permanecen intactas. El puerto principal local es **3000**.

## Arquitectura

Supabase Cron → función SQL `dispatch_smr_jobs()` → cola durable `background_jobs` → `pg_net` POST → `/api/cron/worker` de la aplicación Next.js existente. Una petición procesa un usuario. No requiere navegador ni sesión de cookies. No se añade otro servidor ni se duplica el importador Moodle.

Cada slot de 30 minutos crea como máximo un trabajo por perfil. Los perfiles sin Moodle también necesitan recordatorios personales/generales; solo las cuentas conectadas ejecutan `syncMoodle(userId, "automatic")`. Cada cuenta descifra exclusivamente su propio token, renueva sus cursos y reutiliza la persistencia de B. Un error no impide las peticiones de otros alumnos. Si Moodle falla o está ocupado, se omiten sus recordatorios durante ese trabajo para evitar usar una entrega antigua; los personales y generales continúan.

`moodle_sync_locks` usa una lease privada de 180 segundos por alumno, compartida entre sync manual y automática. Se libera en `finally`, solo con su identificador correcto. Expira si una función termina abruptamente. Los trabajos tienen también lease de 180 segundos, hasta tres reclamaciones tras interrupciones y límite de antigüedad de dos horas. El worker tiene máximo 120 segundos; deja de iniciar nuevos emails al aproximarse su plazo. Moodle conserva su límite de 50 segundos y su límite previo de un intento por minuto.

No se modifica la autenticación ni se usa `APP_BASE_URL` para login. Las rutas de la aplicación siguen relativas. `APP_BASE_URL` sirve solo para enlaces de correo. No se modifican el SMTP/Auth de Supabase ni las variables públicas existentes.

## Admin y calendario

Ejecutar **una vez tras revisar** `supabase/admin/set-owner-admin.sql`, desde SQL Editor con permisos de administración. Busca exactamente una cuenta en `auth.users` con `manuifuenla@gmail.com`, obtiene su ID y actualiza `profiles.role = 'admin'`. Si no hay exactamente una cuenta o falta el perfil, la transacción falla sin cambios. No devuelve secretos.

El permiso real usa el rol almacenado y la función existente `is_calendar_admin()`, reforzado por RLS. El frontend no concede permisos por email. No hay autoasignación de admin. El CRUD general de C sigue disponible para admin; un usuario normal solo lee generales y administra su agenda privada. Moodle sigue sin ser editable. En eventos generales se mantienen título, descripción, asignatura opcional, tipo, inicio/fin, hora y todo el día.

Tras asignar el rol, actualizar la página y abrir `/dashboard/calendario`: **Nuevo evento → General de clase**. Comprobar crear, editar y eliminar con la cuenta propietaria, y que otra cuenta no puede hacerlo.

## Migración aditiva

Archivo: `supabase/migrations/20261005_moodle_phase_d.sql`. Requiere A, B y C ya instaladas. **No ejecutar otra vez `supabase/schema.sql` ni A/B/C.**

- `notification_preferences`: intervalos y canales por usuario, RLS propia; email apagado por defecto.
- `personal_calendar_events.reminder_enabled`: interruptor por evento, activado por defecto.
- `notifications`: admite referencias a general/personal y tipo `reminder`; los avisos Moodle existentes siguen válidos.
- `notification_log`: historial y deduplicación, sin acceso desde navegador.
- `moodle_sync_locks`, `moodle_sync_runs`, `background_jobs`: bloqueos y resultados seguros. El usuario puede leer solo sus resultados de sync.
- `reminder_email_quota`: máximo 200 intentos diarios de recordatorios de esta aplicación.
- RPCs de generación, reclamación y bloqueo: ejecución exclusivamente del servidor (`service_role`), sin `anon`/`authenticated`.

No contiene activación de cron ni llamadas HTTP. Conserva eventos, estados, notificaciones y datos previos. La asignación admin está separada y explícita. El instalador del cron es otro archivo: `supabase/cron/install-phase-d.sql`.

Mientras D todavía no esté instalada, la sync manual y el calendario mantienen compatibilidad con B/C. La casilla de recordatorios personales requiere D para persistirse y las preferencias muestran la necesidad de instalarla; no activar trabajos en ese estado.

## Recordatorios y fechas

En **Configuración → Preferencias de avisos**, elegir 7, 3, 1 y/o 0 días y canales SMR HUB/email. La configuración se guarda por usuario y no acepta un `user_id` del navegador. Al crear/editar un evento personal, su casilla permite desactivar recordatorios.

Para Moodle se utiliza exclusivamente `user_event_state.effective_due_date` de ese alumno, con conexión/identidad/curso vigentes. Una prórroga privada nunca cambia la fecha de otros alumnos. Los recursos sin entrega, estados ocultos/completados/no disponibles y eventos personales completados o sin recordatorios quedan fuera. No se avisa de fechas vencidas.

Los generales y personales con hora usan el inicio. Para todo el día se usa el final del **primer día** de Madrid, de modo que el aviso del mismo día no se considera vencido a medianoche. No se repite por cada día de un evento de varios días.

Los intervalos se calculan por fecha de calendario **Europe/Madrid**, no restando múltiplos de 24 horas. Se programan a las 09:00 de Madrid; el mismo día, si la entrega es a las 09:00 o antes, se programan a las 00:00. Se permite una ventana de 90 minutos para tolerar retrasos y reintentos del scheduler. No se recuperan avisos de días anteriores. Un servicio caído más de esa ventana puede perder un aviso. La programación UTC de cron ejecuta cada media hora; la fecha local del recordatorio deriva de la zona IANA, incluidos cambios DST.

La notificación interna se inserta en la misma transacción que su log. Aparece en la campana y enlaza al evento de calendario, sujeto a los permisos actuales. Si un evento personal/general se elimina, su aviso conserva el historial y deja de ofrecer enlace al evento eliminado.

## Email y deduplicación

Brevo se llama solo desde servidor por su API transaccional. No se reutiliza una contraseña SMTP como API key; Supabase administra su SMTP por separado. El destinatario se obtiene de Auth en el servidor, y debe tener email confirmado. Se envía texto sencillo con título, asignatura, fecha en Madrid, enlace a SMR HUB y, para Moodle, enlace validado al centro. No se envían tokens, notas privadas, contraseñas ni IDs de usuario en el texto.

La clave UNIQUE es **usuario + fuente + evento + entrega efectiva + intervalo**. Cambiar la entrega permite futuros avisos para la nueva fecha y conserva los logs anteriores. Antes de reclamar un email se vuelven a comprobar fecha actual, visibilidad, completado, preferencias y ventana; un pendiente de fecha antigua se suprime. Desactivar email suprime nuevos envíos pendientes y conserva notificaciones internas e historial.

La reclamación del email es atómica (`pending → sending`) y consume cuota antes de llamar a Brevo. Un segundo worker no puede reclamarlo otra vez. Además, se manda `Idempotency-Key` con el ID del log. Los estados `sent`, `sending`, `unknown`, `failed` y `suppressed` no se reenvían automáticamente. Una respuesta aceptada con recibo malformado se considera enviada.

**Decisión ante fallos externos:** no existe una transacción compartida PostgreSQL/Brevo. Si Brevo acepta un correo y la red falla antes de recibir el resultado, no se puede distinguir de un fallo previo al envío. Se prefiere evitar duplicados: dejar `unknown`/`sending` y revisar los registros de Brevo antes de cualquier intervención manual. No cambiar ciegamente esos estados a `pending`. Esto puede perder un email ante interrupciones, rechazo o cuota agotada. Un email ya reclamado no puede retirarse si el usuario cambia sus preferencias justo durante la llamada externa.

La cuota propia limita a 200 intentos por día de Madrid **y por cualquier ventana móvil de 24 horas**, con reclamaciones serializadas en PostgreSQL. Esto evita exceder el margen propio aunque la zona de reinicio de Brevo difiera. Deja margen nominal para SMTP/Auth, pero **no conoce los emails de Auth ni otras aplicaciones**: hay que vigilar el contador compartido de Brevo. La generación interna continúa aunque no quede cuota. Los emails pendientes solo pueden reclamarse durante su ventana; no se acumulan para enviarse tarde.

## Variables privadas nuevas

| Variable | Local | Vercel producción |
|---|---|---|
| `CRON_SECRET` | Secreto aleatorio de al menos 32 caracteres | Mismo valor que `smrhub_cron_secret` en Vault |
| `JOBS_ENABLED` | `true` solo durante una prueba manual autorizada | `false` inicialmente; `true` después de revisión/configuración |
| `REMINDER_EMAIL_ENABLED` | `false` para probar sin enviar | `false` inicialmente; activar después de verificar remitente y opt-in |
| `BREVO_API_KEY` | API key transaccional, no contraseña SMTP | Igual; nunca `NEXT_PUBLIC` |
| `BREVO_SENDER_EMAIL` | Remitente verificado en Brevo | Remitente verificado en Brevo |
| `APP_BASE_URL` | `http://localhost:3000` | `https://smrhub.vercel.app` |

Mantener las variables existentes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `MOODLE_BASE_URL`, `MOODLE_TOKEN_ENCRYPTION_KEY`. Si localhost y producción comparten base de datos, deben usar la misma clave de cifrado Moodle. No imprimir claves, subir `.env.local` ni guardarlas en SQL versionado.

Dos secretos en **Supabase Vault**, creados desde su panel después de revisar:

- `smrhub_job_url`: `https://smrhub.vercel.app/api/cron/worker`.
- `smrhub_cron_secret`: mismo secreto privado de Vercel.

El dispatcher rechaza cualquier destino distinto de esa URL exacta antes de encolar o enviar. Vault/`net`/`cron` no deben añadirse a los esquemas públicos expuestos por la API. Sus tablas HTTP contienen datos de ejecución sensibles: mantener acceso administrativo.

## Frecuencia y presupuesto 0 €

Documentación oficial comprobada durante esta implementación:

- [Vercel Cron Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing): una ejecución diaria por cron; no sirve para 30/60 minutos.
- [Supabase Cron](https://supabase.com/docs/guides/cron): permite intervalos cortos y llamadas SQL/HTTP. [Instalación y gestión](https://supabase.com/docs/guides/cron/quickstart), [Vault y pg_net](https://supabase.com/docs/guides/functions/schedule-functions). Se utiliza **un solo job SQL cada 30 minutos**, sin Edge Function adicional.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby): incluye un millón de invocaciones, 4 horas de CPU activa y 360 GB-horas de memoria al mes, compartidas con el resto de la aplicación. [Fluid Compute](https://vercel.com/docs/fluid-compute) permite máximo 300 segundos en Hobby; `vercel.json` activa Fluid y el worker solicita 120 segundos.
- [Supabase Free](https://supabase.com/pricing): base de datos de 500 MB, egress y actividad limitados; el proyecto puede pausarse. No se contrata un plan de pago.
- [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan): 300 emails diarios, compartidos con Auth. [API transaccional](https://developers.brevo.com/reference/send-transac-email). Su protección de idempotencia no sustituye al log durable propio.

**Frecuencia preparada: 30 minutos**, compatible con el scheduler gratuito. Su continuidad depende de las cuotas reales de las cuentas. No se ha obtenido acceso a los paneles de consumo/facturación de Vercel/Supabase/Brevo; no se afirma que se haya comprobado el saldo disponible de esos proyectos. Revisar esos tres paneles antes de activar. No se configura ninguna compra ni ampliación automática.

Ejemplo de capacidad, no garantía de consumo: 30 perfiles × 48 trabajos/día × 30 días = **43.200 invocaciones/mes**, además de las visitas normales. El volumen real de Moodle, memoria y CPU determina la capacidad restante. Si se acerca a cuotas, pasar el job a 60 minutos o desactivarlo desde Cron. El dispatcher admite hasta 100 trabajos por tick, suficiente para la clase; este diseño no está destinado a miles de cuentas.

Los logs de trabajos/sync crecen con cada ejecución. No hay borrado automático de logs históricos. Vigilar tamaño de base de datos y acordar retención de diagnósticos antes de agotar Free; **no borrar `notification_log`**, porque quitaría la garantía histórica de deduplicación. Cron y pg_net también tienen registros/retención propios.

## Endpoints

| Ruta | Protección y finalidad |
|---|---|
| `GET /api/preferences` | Sesión verificada, solo preferencias/resultados propios |
| `PATCH /api/preferences` | Sesión + Origin, intervalos/canales validados, RLS propia |
| `POST /api/cron/enqueue` | Bearer secreto + `JOBS_ENABLED`, crea slots y devuelve IDs pendientes para pruebas locales |
| `POST /api/cron/worker` | Bearer secreto + `JOBS_ENABLED`, procesa un ID de trabajo, nunca un `user_id` arbitrario del navegador |

Sin secreto válido: 401 (si falta configurar el secreto del servidor: 503). Métodos no implementados: 405. Trabajos desactivados: 503. Datos/errores seguros y `Cache-Control: private, no-store`. Los endpoints de cron no dependen de cookies ni Origin de navegador: son llamadas entre servidores autenticadas con secreto. Las mutaciones de usuarios mantienen sesión/Origin.

## Pruebas realizadas y pendientes

`pnpm test` ejecuta tests de código y PostgreSQL aislado con PGlite. Carga el esquema y las **migraciones reales A/B/C/D**, ejecuta pruebas de permisos A/B/C y D, y verifica el SQL admin usando una cuenta de prueba con el correo objetivo, sin conexión al Supabase real.

D cubre 7/3/1/0 días, Madrid/DST, completado/oculto, canales, prórrogas privadas, cambio de fecha, rechazo de email antiguo, opt-out, cuota, deduplicación, repetición de trabajos, leases expiradas, aislamiento, admin/normal y cron protegido. Brevo utiliza respuestas simuladas: ninguna prueba envía emails reales.

Resultado: **45 tests correctos, typecheck correcto y build correcto**. También se comprobó en `localhost:3000`: login 200, preferencias sin sesión 401, mutación desde otro origen 403 y worker sin secreto configurado 503. El SQL real del dispatcher se prueba con adaptadores locales de Cron/Vault/HTTP: confirma instalación inactiva, rechazo de destinos ajenos y preparación de trabajos sin hacer peticiones externas.

`supabase/tests/moodle_phase_d.sql` termina en **ROLLBACK**. Ejecutarlo en SQL Editor **después** de la migración D y del SQL admin. Comprueba el rol real del propietario y usa usuarios/eventos temporales que revierte. Si falla, ejecutar ROLLBACK antes de continuar. Los tests aislados no verifican la instalación real de extensiones, latencia, entrega real de Brevo ni ejecución de un cron de producción.

## Pasos exactos para probar local (después de revisión)

1. Ejecutar D una vez en el Supabase elegido para la prueba. A/B/C deben estar instaladas. Ejecutar `set-owner-admin.sql`, luego `moodle_phase_d.sql` y comprobar que termina sin errores/ROLLBACK.
2. Añadir las variables privadas en `.env.local`; usar `APP_BASE_URL=http://localhost:3000`, `JOBS_ENABLED=true`, `REMINDER_EMAIL_ENABLED=false`. Generar un secreto largo local; no compartirlo por chat.
3. Arrancar `pnpm dev --port 3000`. Si otro proceso ya usa 3000, detenerlo de forma controlada antes de arrancar. No cambiar el puerto principal a 3001.
4. Entrar como propietario. Comprobar login/logout, sync manual, tareas/exámenes/enlaces, campana y CRUD general. Con otra cuenta comprobar que no puede modificar generales ni preferencias ajenas.
5. En Configuración guardar intervalos y canales. Crear un evento personal con inicio **mañana a las 18:00 Madrid**, intervalo de 1 día y recordatorio activo. Ejecutar los pasos siguientes entre **09:00 y 10:29 Madrid**. Fuera de esa ventana no se genera ese recordatorio; los tests aislados usan un reloj fijo para verificarlo a cualquier hora.
6. En una terminal privada de PowerShell, cargar el secreto sin mostrarlo (no poner su valor en un comando que quede en historial):

   ```powershell
   $taskSecretSecure = Read-Host 'CRON_SECRET local' -AsSecureString
   $taskSecret = [System.Net.NetworkCredential]::new('', $taskSecretSecure).Password
   $taskHeaders = @{ Authorization = 'Bearer ' + $taskSecret }
   $taskQueue = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/cron/enqueue' -Headers $taskHeaders
   # El encolador devuelve jobs[{id}]; identificar tu job en SQL Editor por user_id.
   $taskJobId = Read-Host 'ID de tu trabajo pendiente'
   $taskBody = @{ job_id = $taskJobId } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/cron/worker' -Headers $taskHeaders -ContentType 'application/json' -Body $taskBody
   # Repetir el mismo ID: already_claimed, sin duplicados.
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/cron/worker' -Headers $taskHeaders -ContentType 'application/json' -Body $taskBody
   Remove-Variable taskSecret,taskSecretSecure,taskHeaders
   ```

7. Sin cabecera Authorization, comprobar 401 con secreto configurado. Con `JOBS_ENABLED=false`, comprobar que el secreto correcto tampoco ejecuta trabajos.
8. Revisar campana, preferencias y tablas privadas desde SQL Editor. Para probar otro slot sin esperar, no manipular logs enviados: usar pruebas aisladas o esperar al próximo slot de media hora y volver a encolar.
9. El email real requiere aprobación/revisión: activar su flag, configurar Brevo, activar opt-in únicamente en la cuenta de prueba y comprobar recepción dentro de la ventana. Un evento completado/oculto o con email desactivado no debe enviarse.
10. Al acabar, volver a `JOBS_ENABLED=false` y `REMINDER_EMAIL_ENABLED=false`. Ejecutar `pnpm test`, `pnpm typecheck`, `pnpm build`.

El cron de Supabase no puede llamar a localhost; para pruebas locales se llama manualmente a enqueue/worker. No habilitar el cron productivo mientras se prueba local contra la misma base de datos.

## Preparación de producción (sin desplegar ahora)

1. Revisar cambios y hacer copia/exportación apropiada de la base de datos antes de ejecutar SQL. Confirmar cuotas y planes Free/Hobby en los tres paneles.
2. Ejecutar migración D una vez. Ejecutar SQL admin para la cuenta exacta; ejecutar pruebas SQL D que revierten sus fixtures. Confirmar roles/grants de las funciones privadas.
3. Añadir variables en Vercel **Production**, flags apagados y URL productiva. Verificar que no llevan prefijo público y que la clave Moodle coincide con la actual.
4. Habilitar Supabase Cron/pg_net si todavía no existen. Crear los dos secretos Vault. Ejecutar `supabase/cron/install-phase-d.sql`: deja el job **inactive** dentro de la transacción y no envía ninguna petición. Confirmar `active=false` en el panel Cron.
5. Después de tu aprobación, realizar el despliegue por el procedimiento habitual. `vercel.json` habilita Fluid Compute; no contiene Vercel Cron. Comprobar login/logout, roles y A/B/C en producción antes de automatizar.
6. Activar `JOBS_ENABLED=true` mediante configuración/despliegue autorizado. Mantener email apagado. Probar enqueue y un worker con secreto en entorno privado y revisar `moodle_sync_runs`/`background_jobs`.
7. Activar el job desde el panel Cron o ejecutar **explícitamente**:

   ```sql
   select cron.alter_job(jobid, active := true)
   from cron.job where jobname='smrhub-phase-d';
   ```

   Comprobar dos ejecuciones (30 minutos entre ellas), snapshots sin duplicados, usuarios distintos y errores aislados. No activar Vercel Cron adicional.
8. Verificar API key/remitente Brevo y cuota restante. Activar `REMINDER_EMAIL_ENABLED=true` cuando se apruebe la prueba real; cada alumno debe habilitar email en sus preferencias. Revisar un recibo y los logs antes de abrirlo a la clase.
9. Vigilar uso y tamaño de logs. Ante incidentes, pausar Cron y apagar flags. Mantener sync manual disponible. Para pasar a 60 minutos:

   ```sql
   select cron.alter_job(jobid, schedule := '0 * * * *')
   from cron.job where jobname='smrhub-phase-d';
   ```

## Archivos de esta fase

- Nueva migración D, SQL admin, instalador cron inactivo y pruebas SQL D.
- `src/lib/reminders.ts`, `cron-auth.ts`, `background.ts`, `brevo.ts`, `jobs-server.ts`, `preferences-server.ts`: cálculo, protección, aislamiento y ejecución.
- APIs nuevas `src/app/api/preferences/route.ts`, `src/app/api/cron/enqueue/route.ts`, `src/app/api/cron/worker/route.ts`.
- `src/lib/moodle/sync-server.ts`: wrapper de bloqueo/registro sobre la sync existente.
- `src/lib/calendar.ts`, `calendar-server.ts`, `notifications.ts`, `notifications-server.ts`: recordatorio personal y referencias de avisos al calendario.
- `src/components/notification-preferences.tsx`, `calendar-panel.tsx`, `workspace.tsx`: ajustes simples y casilla personal.
- `src/proxy.ts`: sesión para preferencias; cron conserva autenticación por secreto independiente.
- `tests/reminders.test.ts`, `tests/moodle-database.test.ts`, `tests/dashboard-render.test.ts`: pruebas nuevas, carga de D y renderizado de ajustes.
- `.env.example`, `vercel.json`, `README.md` y esta guía: configuración y preparación.

El árbol de trabajo también contiene cambios previos A/B/C todavía sin commit. No atribuir esos archivos completos a D ni sobrescribirlos al revisar esta fase.
