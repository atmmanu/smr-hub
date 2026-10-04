# SMR HUB

El espacio de 1ºD de Sistemas Microinformáticos y Redes. Versión 0.2: tareas, exámenes, herramientas y recursos de clase en un solo sitio, con datos personales sincronizados en Supabase.

## v0.3 — Fases A, B y C: Aula Virtual y calendario

Conexión guiada, detección y mapeo de cursos, sincronización manual, estado personal y avisos internos. Fase C añade Inicio conectado a Moodle, campana y calendario mixto: Aula Virtual, eventos generales y personales. Sigue las guías de [Fase A](docs/moodle-phase-a.md), [Fase B](docs/moodle-phase-b.md) y [Fase C](docs/moodle-phase-c.md). No hay correo, cron ni recordatorios automáticos. No vuelvas a ejecutar el esquema inicial. El puerto local principal es 3000.

Fase A añade `moodle_connections` y `moodle_course_mappings`, privadas y con token cifrado. Fase B añade `common_events`, `user_event_state`, `notifications` y seguimiento privado de sincronización. Fase C añade `class_calendar_events` y `personal_calendar_events` con permisos independientes. Las contraseñas no se guardan. Las tablas y RLS anteriores se conservan. El resto de esta guía describe las funciones de la base v0.2 que siguen disponibles.

## Qué incluye

- Registro, confirmación por correo, inicio y cierre de sesión con Supabase Auth.
- Dashboard con saludo, tareas pendientes, próximos exámenes y accesos rápidos.
- Crear, editar, completar y eliminar tareas; crear, editar y eliminar exámenes y enlaces.
- Conversor de bases, almacenamiento decimal/binario y calculadoras IPv4 e IPv6.
- Diseño oscuro con navegación adaptable a ordenador y móvil.
- Roles `user` y `admin` preparados. La aplicación pertenece exclusivamente a 1ºD SMR; no tiene selector de clase ni grupos.

Las asignaturas son fijas y se definen una sola vez en `src/lib/data.ts`: Redes Locales, Montaje y Mantenimiento, Sistemas Operativos Monopuesto (SOM), Aplicaciones Ofimáticas, Itinerario para la Empleabilidad (IPE) y Programación en Python.

La actualización 0.2 no requiere cambios en Supabase, migraciones ni modificaciones de RLS. Los registros existentes conservan sus datos; al editar una tarea o examen con una asignatura anterior, debes elegir una de las seis actuales para guardar. La portada solo ofrece acceso y registro; la ruta de herramientas sigue siendo pública.

La calculadora IPv6 funciona localmente: acepta direcciones completas, abreviadas y notación mixta con IPv4 al final. Muestra expansión, compresión hexadecimal, red, clasificación orientativa y los bits de red y host según un prefijo de /0 a /128. No acepta identificadores de zona (`%eth0`), direcciones entre corchetes ni puertos. La clasificación por prefijo no garantiza conectividad ni asignación real; `2001:db8::/32` es un rango de documentación. Referencias: [RFC 4291](https://www.rfc-editor.org/rfc/rfc4291) y [RFC 5952](https://www.rfc-editor.org/rfc/rfc5952).

## Tecnologías y estructura

Next.js organiza las páginas y rutas. React construye la interfaz. TypeScript ayuda a detectar errores. Tailwind CSS aplica estilos. Supabase gestiona PostgreSQL (base de datos) y las cuentas. Vercel alojará la web. Git guarda el historial y GitHub aloja el repositorio.

```text
src/app/                Páginas, rutas privadas, confirmación y estilos
src/components/         Navegación, formularios y pantallas
src/lib/supabase/       Conexiones desde navegador y servidor
src/lib/tools.ts        Cálculos de bases, almacenamiento e IPv4
src/lib/ipv6.ts         Cálculos y validación IPv6
src/lib/data.ts         Tipos de datos y asignaturas
src/proxy.ts            Renovación de la sesión
supabase/schema.sql     Tablas, validaciones y permisos RLS
supabase/verify-rls.sql  Prueba de aislamiento entre usuarios
tests/                  Pruebas de cálculos
.env.example            Variables sin secretos
```

## 1. Ejecutar en tu PC

Instala Node.js 22 o superior (una versión LTS compatible); su instalador incluye npm. En la terminal, dentro de la carpeta del proyecto:

```powershell
npm install --global pnpm@11.19.0
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

El primer comando instala pnpm, el gestor de dependencias. El segundo descarga las bibliotecas. El tercero crea la configuración local. El último arranca la web: abre http://localhost:3000. Detén el servidor con Ctrl+C. `pnpm-lock.yaml` fija las versiones descargadas para reproducir la instalación.

Las herramientas públicas funcionan sin Supabase. Las cuentas y el guardado necesitan la configuración siguiente. No hay almacenamiento local que sustituya a la base de datos.

## 2. Crear y conectar Supabase

1. Crea una cuenta en https://supabase.com.
2. Crea una organización **Free** y un proyecto nuevo. Guarda la contraseña de la base de datos en tu gestor de contraseñas, sin ponerla en el código. Puedes seleccionar una región europea.
3. Abre **SQL Editor → New query** y pega todo `supabase/schema.sql`. Pulsa **Run**. Ejecútalo una vez en un proyecto nuevo; una transacción evita que un fallo deje tablas a medias.
4. Desde **Connect** copia **Project URL** y **Publishable key**.
5. Completa `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU-CLAVE-PUBLICABLE
```

6. En **Authentication → URL Configuration**, establece **Site URL** como `http://localhost:3000`. Añade `http://localhost:3000/auth/confirm` a **Redirect URLs**.
7. En **Authentication → Email Templates → Confirm signup**, usa este enlace en el correo (puedes conservar el resto del texto):

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirmar mi cuenta</a>
```

El enlace permite confirmar la cuenta aunque abras el correo en otro dispositivo. `SiteURL` debe apuntar al entorno donde quieras usar la aplicación. Si pruebas localhost y producción a la vez, el correo irá al Site URL configurado.

8. Habilita email y contraseña en Auth, conserva la confirmación por correo y establece una contraseña mínima de 8 caracteres.
9. Reinicia `pnpm dev` después de cambiar variables. Regístrate y confirma tu correo.

**Correo para compañeros:** el SMTP predeterminado de Supabase tiene límites y solo envía a direcciones autorizadas del equipo del proyecto. Para abrir el registro a compañeros, configura **Custom SMTP** con un proveedor que permita un plan gratuito y revisa sus límites, requisitos de dominio y destinatarios antes de contratar nada. El código no exige un servicio de pago, pero el correo puede requerir configuración adicional. Guía oficial: https://supabase.com/docs/guides/auth/auth-smtp.

## 3. Privacidad y administrador

Un UUID es un identificador único. Auth asigna uno a cada usuario y los datos privados lo guardan como `user_id`.

RLS (Row Level Security) aplica permisos en la base de datos, también a peticiones directas a la API:

- `profiles`: solo puedes leer tu propio perfil y modificar `full_name`. Los permisos de columna impiden cambiar `role` o `id`.
- `tasks`, `exams`, `quick_links`: `USING (auth.uid() = user_id)` limita lectura, edición y borrado a filas propias. `WITH CHECK` exige que las filas creadas o modificadas sigan siendo tuyas.
- Los visitantes sin sesión no tienen permisos sobre esas tablas. Las herramientas calculan en el navegador.
- El perfil se crea automáticamente con rol `user`; el rol no se toma de datos enviados por el usuario.
- Las rutas privadas verifican el token con `getClaims()` en el servidor. RLS protege los datos aunque alguien eluda la interfaz.

Para ser administrador, crea tu cuenta, copia tu UUID desde **Authentication → Users** y ejecuta en SQL Editor:

```sql
update public.profiles set role = 'admin' where id = 'TU-UUID';
```

En v0.2 el rol prepara funciones futuras; no concede acceso a los datos privados de otros usuarios.

La clave **publishable** está diseñada para ser pública y sus consultas están protegidas por RLS. Nunca incluyas claves `service_role`, claves secretas `sb_secret_...`, contraseñas o tokens privados en el código, en variables `NEXT_PUBLIC_` ni en GitHub. `.env.local` y los demás `.env` se excluyen de Git; `.env.example` solo contiene los nombres.

## 4. Comprobar el proyecto

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Comprueban los cálculos, revisan los tipos y generan la versión de producción. Para ejecutarla localmente utiliza `pnpm start` después de compilar.

Ejecuta `supabase/verify-rls.sql` en SQL Editor después del esquema: simula dos usuarios, comprueba aislamiento y protección del rol, y revierte los datos de prueba. Si falla, ejecuta `rollback;` antes de volver a probar. Completa además estas pruebas con cuentas reales:

1. Registra dos cuentas y confirma sus correos.
2. Con la primera crea y edita una tarea, un examen y un enlace; completa la tarea y recarga.
3. En otro navegador o sesión privada entra con la segunda cuenta: no debe ver datos de la primera.
4. Con la primera elimina los registros y recarga para comprobarlo.
5. Cambia tu nombre y comprueba el saludo y el menú.
6. Cierra sesión y abre `/dashboard`: debe redirigir a `/login`.
7. Entra desde otro dispositivo: los datos deben reaparecer. Recarga para ver cambios realizados en otra pestaña o dispositivo; no hay actualización en directo en v0.2.

La autenticación, persistencia y RLS requieren un proyecto Supabase configurado. Compilar la web no confirma esas integraciones.

## 5. GitHub y Vercel

Git ya está inicializado y conectado a `atmmanu/smr-hub`. Estos comandos muestran cambios, los preparan, crean un punto del historial y lo suben:

```powershell
git status
git add .
git commit -m "Actualizar SMR HUB a v0.2"
git push origin main
```

Verifica que `.env.local` no aparece en `git status` antes de preparar archivos. Subir cambios requiere tu acceso a GitHub; no compartas tus credenciales.

1. Crea una cuenta en https://vercel.com y selecciona **Hobby**.
2. Abre **Add New → Project**, conecta GitHub e importa `atmmanu/smr-hub`.
3. Vercel detectará Next.js y pnpm. Selecciona Node.js 22 o una LTS compatible superior y deja los comandos detectados.
4. Añade las dos variables de `.env.local` en **Environment Variables**, sin comillas.
5. Pulsa **Deploy**. Obtendrás una URL `https://…vercel.app`.
6. En Supabase establece esa URL como **Site URL** y añade `https://…vercel.app/auth/confirm` a **Redirect URLs**.
7. Prueba registro, confirmación, inicio de sesión y datos privados antes de compartir la web.

## Coste y límites

Se puede empezar con 0 € usando Supabase Free y Vercel Hobby dentro de sus cuotas. Hobby permite uso personal no comercial. Supabase puede pausar proyectos gratuitos con baja actividad durante siete días; se reactivan desde su panel. Revisa las condiciones actuales en https://vercel.com/docs/plans/hobby y https://supabase.com/pricing, además de las del proveedor SMTP. Mantén los planes gratuitos; no se incluyen compras, dominio propio ni servicios de pago automáticos.

Los pasos de creación de cuentas, SQL y correo son para la primera instalación. Si ya tienes la versión 0.1 funcionando en producción, la 0.2 reutiliza el mismo proyecto Supabase y sus variables: no vuelvas a ejecutar el esquema. Revisa los cambios locales antes de hacer commit, push o desplegar.



v0.2
- Adaptación exclusiva a 1ºD SMR
- Seis asignaturas fijas
- Cambio de “En el horizonte” a “Lo que se viene”
- Nueva calculadora IPv6
- Portada pública simplificada

## v0.3 — Fase D (preparada, sin activar)

La [guía de Fase D](docs/moodle-phase-d.md) contiene la migración aditiva, el SQL seguro para asignar admin, las pruebas y los pasos de configuración. Supabase Cron llama al worker de Next.js cada 30 minutos; el instalador deja el job **inactivo**. Email y trabajos automáticos están desactivados por defecto. No volver a ejecutar el esquema inicial ni las migraciones A/B/C ya instaladas.
