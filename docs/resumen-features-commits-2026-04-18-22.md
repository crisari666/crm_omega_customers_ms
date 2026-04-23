# Resumen de funcionalidades (commits 18–22 abril 2026)

Rango analizado: **2026-04-18** a **2026-04-22** (inclusive).  
Repos sin commits en ese rango: **crm_voice_agent**, **crm_whatsapp_ms** (working tree puede tener cambios sin commit).

---

## Para negocio (sin tecnicismos)

**En pocas palabras:** en una semana se reforzó el **seguimiento de clientes** (quién los creó, a quién están asignados, en qué etapa van y qué proyectos les interesan), se añadió **visibilidad de llamadas** y su vínculo con el expediente del cliente, se mejoró la **formación del equipo** (invitaciones, recordatorios por WhatsApp, enlace a videollamada), se avanzó en **reportes para dirección** (resumen operativo y contratos firmados), y se preparó contenido para **comunicar entregas de proyectos** (listados con imágenes). Todo apunta a menos fricción operativa, más trazabilidad y mejor coordinación entre ventas, administración y formación.

### Clientes y pipeline

- Los equipos pueden **gestionar clientes desde el panel de administración**: buscar, filtrar, ver el detalle, actualizar datos, dejar **notas** y registrar **proyectos de interés**.
- Queda claro **quién dio de alta** a un cliente, **a quién está asignado** y desde **cuándo** (fecha de asignación), lo que ayuda a rendición de cuentas y priorización.
- Las **etapas del embudo** (pasos del cliente) se pueden consultar y actualizar con más control; el catálogo de etapas es más usable tanto en **panel admin** como en la **app del asesor (vendor)**.
- Se evitan confusiones cuando el **teléfono o WhatsApp** vienen en formatos distintos; el sistema los **unifica** y avisa si hay solapamientos.
- Los asesores tienen **agenda** para organizar su día (eventos vinculados a su actividad).

### Llamadas y voz

- Las **llamadas** quedan registradas para que administración y equipo puedan **ver historial, estado y detalle** sin perder el contexto del cliente.
- Lo que ocurre en la **centralita / voz** se conecta con el **expediente del cliente**, de modo que la información de llamadas no quede aislada.

### Formación y recordatorios

- Las sesiones de formación pueden llevar **enlace a videollamada (Google Meet)** en la información que ve el usuario.
- Hay **recordatorios automáticos por WhatsApp** para que la gente no pierda las formaciones.
- Las **invitaciones por correo** son más claras y profesionales (incluyen calendario para añadir al agenda del asistente).

### Contratos, números de teléfono y vista de dirección

- Nuevo **resumen para dirección (CEO)** con indicadores operativos, incluyendo visibilidad sobre **contratos firmados** y **cuántos asesores distintos** participan en ese proceso en un periodo.
- Mejor gestión de **contratos firmados** en el panel (incluso agrupación por correo para ver duplicados o familias de contacto).
- Los **números de teléfono de la empresa (Twilio)** se pueden marcar con un **propósito** (por ejemplo, ventas vs soporte) y asociarlos a **personas concretas** cuando haga falta.

### Proyectos entregados y material comercial

- Nueva sección de **“Proyectos finalizado”** en el panel para dar seguimiento a **entregas cerradas**.
- El sistema de conocimiento / contenidos (**RAG**) permite **publicar y administrar “releases” de proyecto** con **fotos o imágenes**, listos para usarse en pantallas o comunicaciones.

### Experiencia día a día

- Listas de usuarios y clientes **cargan más rápido** en algunos puntos críticos del panel.
- Menos errores al **añadir clientes duplicados por teléfono** y flujos más claros al cerrar ventanas o guardar notas.

---

## Detalle técnico por repositorio

## crm-omega-customers-ms

- API de **agenda del ventor** (eventos).
- Campo **assignedDate** en cliente y lógica asociada.
- Manejo de **eventos WhatsApp** y búsqueda de cliente.
- **Registros de llamadas** para administración.
- Listado admin de clientes con **agregación, filtros** y proyección ajustada.
- **Índices** en esquema de cliente para rendimiento.
- Servicio de cliente con **currentStep** y **customerStepId**.
- Campo **createdBy** en tipos y servicio.
- **RabbitMQ** para procesamiento de llamadas de voz.
- **Webhooks y registro** de llamadas de voz.
- Normalización de **teléfono y WhatsApp** con manejo de conflictos.
- Paso de pipeline vía **PATCH /step** y log de cambios de paso.
- Módulo **CRUD del catálogo de pasos** (customer-steps).
- API admin: **GET/PATCH** detalle con notas y actualización de campos.
- API admin: **asignación**, endpoint de asignado y **auditoría de cambios**.
- Listado admin con **filtros** y flag **enabled**.
- Creación admin con **nota** y **projectId**; **POST /customer/admin** creación mínima.
- Seguimiento de **proyectos de interés** y mejoras de esquema/API.
- **JWT de office** validado en rutas de cliente.
- Guía HTTP de consumo de API; **esquemas Mongoose** y endpoints HTTP iniciales.

---

## quantum-voice-server

- **Publicación de eventos** de llamadas por RabbitMQ.
- Mejoras en **registro de llamadas** y manejo de **transcripciones**.

---

## crm_lots_agents

- **Recordatorios de formación** (training reminder).
- Lista clientes v2: **creatorIsPhysical**, fetch de **usuario** en lista, simplificación de datos.
- **Página de historial de llamadas** con detalle, estados y fetch de usuarios.
- **Distribución de pasos** del cliente y más opciones de filtro.
- Resumen **CEO operations** (nuevo módulo de vista).
- **Contratos firmados**: gestión y **agrupación por email**.
- **Números Twilio**: propósito con toggle y asociación a usuario.
- **Seguimiento de formación**: integración **Google Meet** y filtros.
- Página admin **Proyectos finalizado**; grupo en dashboard y ruta.
- Redux **projectReleases**; servicio y tipos de **project-releases**.
- **AddCustomerDialogCP** para alta de cliente.
- **steps-v2**: página de gestión y flujo de diálogo (color picker, validación).
- Cliente v2: estado Redux de lista, diálogo de detalle, **ojo para abrir editor**.
- **Editor inline de asignado** y rutas API admin/cliente.
- Lista admin con **Buscar** y filtros; formulario compacto con nota y proyecto.
- Cliente **customers-ms**: cliente HTTP, página, navegación, **Autocomplete** de asignado.

---

## omega_rag

- Módulo **ProjectRelease**: registro en app Nest.
- **HTTP controller** y módulo Nest.
- **Subida y borrado** de imágenes; persistencia y mapeo de respuestas API.
- **Esquema, DTOs** y servicio de almacenamiento de imágenes.
- **ImageCompressionService** exportado para reutilización.
- **Directorio de subida** de imágenes de project-release en config.
- Especificación de listado de releases con imágenes; doc de integración frontend.

---

## referrals-boost

- **Agenda del vendor** (UI y estado).
- Clientes: **fecha asignada** y filtros por fecha; mejora de **búsqueda y visualización**.
- **Notas** en detalle e integración con **ID de cliente** en diálogos.
- **AddClientModal**: teléfono duplicado y cierre de modal.
- **Interés por proyecto**: títulos en fila, fetch en lista, detalle y hooks.
- Redux **catálogo de pasos**, filtro en lista, ajustes UX CRM.
- **Edición de perfil** de cliente y pasos de pipeline respaldados por MS.
- Integración con **microservicio de clientes** y mejoras en notas.

---

## whatsapp_cloud_ms

- Plantillas de **recordatorio de formación** y su manejo.
- Ajuste de **parámetros** de plantillas de mensaje.
- Plantillas con **URL de Google Meet**.

---

## omega_office_back

- Sistema de **recordatorios de formación** con **WhatsApp** y programación de asistentes.
- **Design system** UI/UX con búsqueda e integración del servicio de recordatorios.
- Consulta de usuarios admin incluye campo **physical**.
- **queryAdminUserList** para listado admin CRM optimizado.
- **CeoOperationsSummary**: módulo, DTO, servicio; conteo de **ventors distintos** en firma de contratos.
- Endpoint **historial admin** de sesiones de firma de contratos (filtros por fecha).
- Invitaciones de formación por **email con marca**, adjunto **.ics** y enlaces a Calendar.
- **googleMeetUrl** en estructuras y eventos de formación.
- Endpoint **toggle purpose** en números Twilio y mejoras en servicio Twilio.
- **GoogleService**: varias cuentas de servicio (Calendar vs Drive/Docs), credenciales unificadas.
- **Mutex** y dependencia async-mutex para actualizaciones concurrentes de eventos de calendario.
- Reintentos y **jitter** en llamadas a Google API; parámetro **quotaUser** en patch de eventos.
- Ajustes de **scopes**, logging y `sendUpdates: 'all'` en parches de Calendar.

---

## Fuentes

Commits obtenidos con:

`git log --since="2026-04-18 00:00:00" --until="2026-04-23 23:59:59" --date=short`

por repositorio en los paths del workspace Omega CRM/voz/WhatsApp/RAG.
