# SMR HUB v0.3 — Fase C

Inicio muestra conexión Aula Virtual, última sincronización, botón manual, contador de novedades y contenido reciente; añade «Próximos eventos». La campana aparece en todas las páginas del dashboard. El calendario mezcla las tres fuentes sin modificar las tablas de tareas/exámenes manuales ni las migraciones A/B. No incluye email, cron, push ni recordatorios automáticos.

## Instalar y probar localmente

1. Fases A/B ya deben estar aplicadas. Conserva una copia de seguridad habitual. No vuelvas a ejecutar `schema.sql` ni migraciones anteriores.
2. Ejecuta **una vez** `supabase/migrations/20261004_moodle_phase_c.sql` en SQL Editor de Supabase. Es una migración aditiva: `class_calendar_events`, `personal_calendar_events`, función de autorización admin, políticas RLS, índices y triggers de fecha de actualización. No la ha aplicado Codex en tu proyecto real.
3. Ejecuta `supabase/tests/moodle_phase_c.sql` en SQL Editor. Inserta datos de prueba con correos `example.invalid`, comprueba permisos y termina en **ROLLBACK**. Si se detiene por error, ejecuta `ROLLBACK` antes de volver a intentarlo.
4. No hay variables de entorno nuevas. Mantén las de Fase A/B. No expongas ninguna clave privada en `NEXT_PUBLIC_`.
5. Arranca `pnpm dev --port 3000`. Abre `http://localhost:3000`, inicia sesión y revisa Inicio: estado, fecha de sincronización, novedades, próximas tareas y exámenes existentes. Las tareas manuales siguen en sus secciones originales.
6. Abre `/dashboard/calendario`. Como usuario normal, crea un evento Personal con asignatura y hora. Debe aparecer en el mes y en Inicio si está en los próximos seis meses. Edita, completa y elimina ese evento de prueba cuando hayas terminado.
7. Crea un evento de todo el día y otro con varios días. Comprueba que las fechas se conservan al cambiar de mes y que no se muestra UTC crudo. El final de un evento de todo el día es inclusivo en el formulario.
8. Como admin, el formulario permite elegir **General de clase**. Crea un evento de prueba. Otro usuario debe verlo, pero no editarlo ni borrarlo. Los eventos Personales del admin siguen siendo privados.
9. Si hace falta probar admin, usa una cuenta de prueba existente y cambia su rol **solo en SQL Editor**: `update public.profiles set role = 'admin' where id = 'UUID-DE-TU-CUENTA-DE-PRUEBA';`. Este proyecto ya admite `user`/`admin`; no se añade moderador. No asignes admin a alumnos normales. Puedes devolver la cuenta a `user` al terminar. La interfaz nunca decide el rol.
10. Sincroniza Aula Virtual, respetando el minuto entre consultas. Las tareas con fecha aparecen en Calendario con la fecha efectiva de tu cuenta. Al abrirlas, puedes cambiar leído/completado/favorito/oculto, pero no su título, descripción o fechas. «Abrir en Aula Virtual» lleva a Moodle. Completar aquí no entrega una tarea.
11. Oculta una actividad Moodle: desaparece de calendario y próximos eventos. Puede recuperarse desde Aula Virtual («Mostrar ocultos») o desde el detalle enlazado por un aviso que todavía tengas accesible.
12. Cuando haya avisos reales, abre la campana, marca uno leído y después todos leídos. El contador se actualiza sin generar avisos nuevos. Otro usuario no debe verse afectado. Los avisos enlazan al detalle, incluido contenido sin fecha; ese contenido no ocupa una fecha ficticia en el calendario.
13. Prueba filtros por fuente y asignatura, mes anterior/siguiente, Hoy y agenda. En móvil se utiliza automáticamente la agenda; en escritorio puedes alternar mensual/agenda. Prueba también tareas, exámenes, enlaces, herramientas y login/logout existentes.

## Páginas y componentes

- `src/app/dashboard/layout.tsx`: provider de notificaciones y campana común.
- `src/components/workspace.tsx`: bloque compacto Aula Virtual y próximos eventos en Inicio, manteniendo los bloques anteriores.
- `src/components/sidebar.tsx`: enlace Calendario.
- `src/components/notification-center.tsx`: campana/panel, contador completo, lectura individual y lectura de todos.
- `src/components/moodle-dashboard.tsx`: resumen compacto y sincronización manual reutilizando la API B.
- `src/components/calendar-panel.tsx`: próximos eventos, mes, agenda, filtros, detalles y formularios.
- `src/app/dashboard/calendario/page.tsx`: ruta privada del calendario y apertura de eventos enlazados.
- `src/components/moodle-panel.tsx` y `moodle-sync-panel.tsx`: notifican al resto de vistas al cambiar conexión/estado o sincronizar. Mantienen el flujo existente.
- `src/lib/calendar.ts`: conversiones Europe/Madrid, validación, filtros, ordenación y helpers de calendario.
- `src/lib/calendar-server.ts`, `notifications-server.ts`, `dashboard-server.ts`: acceso con sesión y RLS, validación y respuestas seguras. `src/proxy.ts` renueva también la sesión en las APIs nuevas.
- Tests nuevos de calendario y render; el test PostgreSQL ahora carga el esquema original y migraciones/pruebas A/B/C sin modificarlas. README y guías reflejan Fase C y puerto 3000.

## API nueva

Todas las rutas usan cookies existentes, sesión validada y `Cache-Control: private, no-store`. Las mutaciones requieren Origin del mismo sitio.

| Ruta | Método | Función |
| --- | --- | --- |
| `/api/notifications` | GET | 30 avisos recientes y contador exacto de todos los no leídos propios |
| `/api/notifications` | PATCH | `{id, read}` sobre un aviso propio |
| `/api/notifications/read-all` | POST | Marca todos los avisos propios actuales como leídos |
| `/api/calendar` | GET | Calendario; `from`/`to` son fechas Madrid, `to` exclusivo, intervalo máximo de un año |
| `/api/calendar` | GET | Detalle: `source=moodle|general|personal&event=UUID` |
| `/api/calendar` | POST | Crear Personal; admin también General |
| `/api/calendar` | PATCH | Editar evento autorizado o `{source:"personal",id,completed}` |
| `/api/calendar` | DELETE | `{source,id}`: eliminar solo un evento autorizado |

La creación/edición usa `{source,title,description,subject,event_type,all_day,start,end}`; edición añade `id`. Para todo el día, `start`/`end` son fechas `YYYY-MM-DD`; para horas, `YYYY-MM-DDTHH:mm` en Madrid. Asignatura puede ser null o una de las seis. Tipos manuales: `activity`, `exam`, `deadline`, `holiday`, `other`. Crear/editando no se aceptan dueños/roles enviados por el cliente. La API rechaza fuentes Moodle para escritura de eventos. Los cambios de estado Moodle reutilizan `/api/moodle/sync` de B.

## Calendario y permisos

- **🏫 Aula Virtual**, azul: eventos comunes accesibles por RLS y estado personal propio. La fecha principal es `effective_due_date`; se usan fechas comunes reservadas o apertura cuando no hay entrega. Sigue la decisión B: las posibles prórrogas son privadas por alumno. Sin fecha, el contenido se abre desde avisos/Aula Virtual pero no se incluye en la cuadrícula.
- **👥 General**, verde: visible a todos los usuarios autenticados. Crear/editar/borrar exige `profiles.role='admin'`, comprobado en servidor y en RLS. `created_by` se asigna con `auth.uid()`; el cliente no puede cambiarlo. Si se elimina la cuenta creadora, el evento de clase se conserva y el autor pasa a null.
- **👤 Personal**, violeta: privado por `user_id=auth.uid()`, con CRUD propio y completado opcional. Ser admin no permite acceder a personales de otros alumnos. El propietario se asigna en BD y no se puede cambiar desde el cliente.
- Se distinguen fuentes por etiqueta/icono además del color. No hay nuevas asignaturas ni clases/grupos seleccionables.

## Fechas y decisiones

- Timestamps con hora en `timestamptz`, renderizados con `Intl` y zona **Europe/Madrid** explícita. Los campos de formulario se interpretan en esa zona, no en la zona del ordenador. Se derivan offsets IANA para evitar asumir una hora fija de verano/invierno.
- Días completos guardan también `start_date`/`end_date`, y BD comprueba coherencia con medianoche Madrid. Un día de cambio horario puede durar 23 o 25 horas y sigue mostrándose en su fecha correcta.
- Una hora inexistente durante el salto de primavera se rechaza. Si la hora se repite en otoño, se utiliza la primera aparición; el formulario lo explica. No hay selector de segunda aparición en esta versión.
- Próximos eventos: orden cronológico, hasta cinco entradas de los próximos 180 días, excluyendo ocultos. Eventos en curso con final futuro siguen siendo visibles. Los exámenes y tareas manuales originales permanecen en sus bloques y tablas; no se copian automáticamente al nuevo calendario para evitar duplicación o cambiar sus reglas.
- Los enlaces de notificaciones se generan en servidor y solo se ofrecen si el evento sigue accesible por RLS. Se conservan avisos históricos privados aunque ya no se pueda abrir el evento.
- Un evento local del navegador refresca campana, resumen y calendario después de mutaciones. No hay polling, cron ni automatizaciones. Para cambios en otra sesión, recarga o usa Actualizar.
- Las consultas y escrituras nuevas de calendario/notificaciones usan el cliente Supabase **del usuario**, protegido por RLS. El cliente privilegiado de A/B solo se conserva para consultar metadata de conexión propia y sincronización Moodle. No se devuelve ninguna clave ni token al navegador.

## Verificación y límites

- Suite automatizada: 33 tests correctos, incluyendo fechas, DST, filtros, ocultos, orden, render real de componentes con adaptadores de navegación simulados y pruebas SQL de CRUD, RLS, admin, notificaciones, read-all y regresión A/B en PostgreSQL aislado. `pnpm typecheck` y `pnpm build` completados correctamente.
- Navegador local con sesión existente: Inicio y campana renderizan, conexión Moodle y contenidos B disponibles. Revisado ancho de página a 375, 768 y 1280 px: sin desbordamiento horizontal del documento; móvil muestra agenda y escritorio mes.
- Sin sesión, todas las APIs nuevas devuelven 401 y el calendario privado redirige al login. Origen externo en mutaciones: 403.
- **La migración C no se ha aplicado en el Supabase real**. La prueba del formulario con guardado real y eventos poblados debe realizarse tras aplicarla. En la revisión local, el calendario mostró el aviso correcto de migración pendiente.
- Hasta 500 filas por fuente e intervalo; se avisa si el resultado se trunca. Campana: 30 recientes y contador completo; «Marcar todas» incluye los antiguos fuera de esa lista. No hay paginación, recurrencia, arrastrar eventos ni actualizaciones en tiempo real.
- Sin email, Brevo, cron, recordatorios automáticos, push ni Fase D. Sin commit, push o despliegue.
