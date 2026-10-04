# SMR HUB v0.3 — Fase A

Esta entrega añade conexión guiada, validación de cuenta, detección de cursos, mapeo automático/manual y desconexión. **No importa tareas, contenidos, eventos ni avisos.** Las fases B, C y D requieren aprobación.

## Arquitectura y seguridad

Se conservan Next.js App Router, Supabase Auth con cookies y las tablas `profiles`, `tasks`, `exams` y `quick_links`. Sus datos y políticas RLS no cambian. La fase añade una tarjeta en Inicio, `/dashboard/aula-virtual` y `/api/moodle`.

La API verifica la sesión con `getUser()` y usa su UUID; nunca acepta el usuario propietario enviado por el navegador. Las escrituras requieren el mismo origen, incluido el puerto actual. El login y sus callbacks permanecen intactos.

Las dos tablas nuevas son exclusivamente de servidor. Su RLS y permisos impiden toda lectura/escritura desde `anon` y `authenticated`. Un cliente separado con la clave privada de Supabase accede a ellas, siempre filtrando por el UUID verificado. Esa clave nunca se envía al navegador.

El token se cifra con AES-256-GCM, clave de 32 bytes fuera de la base de datos, nonce aleatorio y vinculación al UUID del dueño. No se almacena usuario ni contraseña Moodle. La contraseña se utiliza durante la petición y no se guarda en tablas, logs, estado React ni localStorage. No se puede garantizar borrado físico inmediato de la memoria del runtime, pero no se retiene para peticiones posteriores.

El servidor usa únicamente la URL configurada: HTTPS oficial de EducaMadrid, sin redirecciones. Credenciales y token van en cuerpos POST, nunca en URLs. Límites: 1 MiB por respuesta, 200 cursos y 8 KiB por petición interna. Los errores externos se sustituyen por mensajes propios. Los nombres se muestran como texto escapado por React, sin ejecutar HTML.

## Base de datos

- `moodle_connections`: una fila por usuario, URL, ID Moodle, token cifrado y fechas. Un intento fallido puede dejar una reserva sin token; no significa conectado.
- `moodle_course_mappings`: clave `(user_id, course_id)`, nombres, asignatura opcional, selección manual y fecha. Solo acepta las seis asignaturas fijas.
- `claim_moodle_attempt`: reserva atómicamente un intento por minuto por usuario.
- `save_moodle_connection`: guarda conexión y cursos en una transacción, evita duplicados y mantiene los mapeos manuales. Cambiar de cuenta Moodle reemplaza los cursos de conexión.
- Desconectar elimina conexión y mapeos, conservando tareas, exámenes y enlaces. No revoca el token en Moodle; puedes revocarlo allí en las claves de seguridad de tu cuenta.

## 1. SQL en Supabase

1. Abre el proyecto **existente**, **SQL Editor → New query**.
2. Copia todo `supabase/migrations/20261004_moodle_phase_a.sql` y pulsa **Run** una sola vez.
3. No vuelvas a ejecutar `supabase/schema.sql`; es el esquema inicial.
4. La migración es una transacción; si falla, no deja una instalación parcial. No borres tablas existentes.
5. Ejecuta `supabase/tests/moodle_phase_a.sql` en otra consulta para comprobar permisos, rate limit, deduplicación, conservación del mapeo y desconexión. Revierte todos sus datos de prueba. Si falla, ejecuta `rollback;` antes de repetirlo.

Los scripts están preparados, **no se han ejecutado en tu proyecto**. Los tests locales no sustituyen estas pruebas reales de permisos.

## 2. Variables privadas

Conserva las dos variables públicas de Supabase. Añade al servidor en `.env.local`:

```dotenv
SUPABASE_SECRET_KEY=TU-CLAVE-PRIVADA-DE-SUPABASE
MOODLE_BASE_URL=https://aulavirtual34.educa.madrid.org/ies.jovellanos.fuenlabrada
MOODLE_TOKEN_ENCRYPTION_KEY=TU-CLAVE-DE-32-BYTES-EN-BASE64
```

Obtén la clave secret (`sb_secret_...`) desde **API Keys** de Supabase. También puedes usar la clave legacy `service_role` si tu proyecto utiliza ese sistema. No uses `anon`/publishable. Ninguna de estas variables debe llevar prefijo `NEXT_PUBLIC_`. No compartas secretos por chat ni los subas a GitHub.

Genera una clave de cifrado en tu terminal con este comando: crea 32 bytes aleatorios y los muestra en base64 para que los copies a la variable privada:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Guárdala en tu gestor de contraseñas. Usa la misma clave en localhost y Vercel si comparten base de datos. Cambiarla sin recifrar los tokens obligará a reconectar las cuentas. No se genera ni escribe ninguna clave automáticamente en este repositorio.

## 3. Configurar Vercel

1. Abre **Settings → Environment Variables** del proyecto actual.
2. Añade las tres variables privadas al entorno donde vayas a probar; conserva las anteriores.
3. Comprueba el destino Moodle y que no hay prefijos `NEXT_PUBLIC_` en los secretos.
4. Después de revisar y aprobar el código, redespliega para aplicar las variables.

No se ha hecho commit, push ni deploy. No se modifican Brevo SMTP, confirmación por correo ni login de producción. El Moodle del centro debe permitir `moodle_mobile_app`, REST, `core_webservice_get_site_info` y `core_enrol_get_users_courses`. Si exige SSO/segundo factor o desactiva esos servicios, necesitarás consultar con su administrador. SMR HUB no elude esas restricciones.

## 4. Probar en localhost

1. Completa `.env.local` y aplica la migración y prueba SQL.
2. Ejecuta `pnpm dev --port 3000` y abre `http://localhost:3000`. Este es el puerto principal de desarrollo; la integración usa rutas relativas y no depende de un puerto hardcodeado.
3. Inicia sesión en SMR HUB con tu cuenta confirmada.
4. Pulsa **Conectar Aula Virtual** en Inicio o abre `/dashboard/aula-virtual`.
5. Verifica el destino e introduce tu usuario/contraseña **del Aula Virtual**. No tienen por qué coincidir con tu cuenta SMR HUB.
6. Revisa los cursos y asigna los pendientes a una de las seis materias. Puedes dejarlos sin asociar para excluirlos de la futura sincronización.
7. Espera un minuto y pulsa **Actualizar cursos**: no se duplican ni pierden mapeos manuales.
8. Prueba otra cuenta SMR HUB: no debe ver los cursos de la anterior. Modificar un curso ajeno devuelve 404.
9. Desconecta y comprueba que desaparecen conexión y cursos, conservando tus datos personales.
10. Sin sesión, `/api/moodle` debe responder 401. Las tablas nuevas no deben poder consultarse con la clave pública.

Si faltan variables, se muestra que la conexión no está habilitada. Si falta la migración, se informa sin bloquear el resto del dashboard. «Conectada» indica la última validación; la caducidad o revocación se detecta al volver a consultar Moodle, no continuamente.

## 5. Validación

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Incluyen los tests existentes y casos nuevos de mapeo, parsing, cifrado, respuestas Moodle simuladas, errores, límites y protección de origen. La prueba con cuentas reales requiere configurar secretos y SQL e introducir tú mismo las credenciales. No se utilizan credenciales reales en los tests.

No hay dependencias nuevas ni servicios de pago en esta fase.

## Fases futuras: diseño previsto, sin implementar

- **B:** evento común con identidad `(source, external_id, moodle_course_id, moodle_site)` y estado personal independiente `(user_id, common_event_id)`. Antes de compartir contenido se comprobará que no contiene datos particulares de una cuenta o grupo.
- **C:** novedades y calendario general/personal/importado en Inicio, con permisos para eventos generales.
- **D:** notificaciones, preferencias, registro de recordatorios, correo de servidor y selección de cron gratuito tras investigar sus límites actuales. No hay cron ni correo de recordatorios en esta entrega.

No se crean tablas ni servicios de esas fases sin aprobación.

Referencias: [servicios Moodle](https://moodledev.io/docs/5.0/apis/subsystems/external), [funciones Moodle](https://docs.moodle.org/dev/Web_services_Roadmap), [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
