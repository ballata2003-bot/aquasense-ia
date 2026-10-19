# Cuestionario — Proyecto Final de Tecnologías Emergentes (Sistema Multiagente)

> **Cómo usar este documento.** Es un borrador redactado a partir del código real del repositorio. Los campos `[COMPLETAR]` son datos que solo el equipo puede aportar (nombres, URLs, mediciones en línea). **No inventen cifras:** donde el cuestionario pide una medición, ejecuten el script indicado contra la URL pública y peguen el resultado. Un integrante redacta, el equipo valida y **todos copian idéntico** (regla 1 del cuestionario).
> Nunca escriban claves, contraseñas ni tokens aquí: solo el nombre de la variable de entorno.

## A. Datos del integrante y del equipo

| Campo | Respuesta |
|---|---|
| A1. Código y nombres completos | [COMPLETAR — cada integrante] |
| A2. Número de grupo | [COMPLETAR] |
| A3. Integrantes y rol | [COMPLETAR — p. ej. orquestación y agentes · interfaz · pruebas y despliegue · documentación] |
| A4. Nombre del proyecto | **AquaSense IA** — sistema multiagente para detección de fugas de agua |
| A5. URL pública (HTTPS) | [COMPLETAR — p. ej. https://aquasense-ia.onrender.com] · salud: `<URL>/health` |
| A6. Repositorio GitHub | [COMPLETAR] |
| A7. Video demostrativo (3–5 min) | [COMPLETAR] — guion en `docs/GUIA_ENTREGA_Y_SUSTENTACION.md` |

## B. Problema, usuario e innovación

**B1. Problema y usuario.** Las fugas de agua pasan desapercibidas hasta que llega la factura o aparece el daño. En el Perú, el informe técnico de Sunass sobre agua no facturada indica que **el 38.5 % del agua producida por las EPS no se cobra** y que en la última década se dejaron de facturar unos **S/ 1 885 millones** (S/ 345 millones solo en 2024) en las empresas grandes. Fuentes: [Sunass (gob.pe)](https://www.gob.pe/institucion/sunass/noticias/1283937-sunass-valor-del-agua-no-facturada-alcanzo-mas-de-s-1-800-millones-en-la-ultima-decada) y [Diario Expreso](https://www.expreso.com.pe/economia/perdidas-de-agua-superan-s-1800-millones-sunass-da-a-conocer-que-monto-es-por-lo-no-cobrado-sedapal-noticia/1237914/). *Aclaración honesta:* el agua no facturada incluye fugas en la red, errores de medición y conexiones no registradas; **no es solo fuga intradomiciliaria**. Usamos la cifra como evidencia de que la pérdida de agua es un problema material, y nuestro foco es la **fuga dentro del hogar o edificio** (usuario: hogares, pequeños comercios y administradores de edificios; en una EPS, el equipo que atiende reclamos).

**B2. Solución actual y limitaciones.** Hoy la fuga doméstica se descubre por la factura mensual, por humedad visible o por un técnico que revisa el medidor manualmente. Limitaciones: reacción tardía (el ciclo de facturación es mensual — *supuesto a validar con una factura real*), sin alertas, sin criterio sobre qué hacer ni a quién avisar, y sin registro de decisiones.

**B3. Innovación y diferencia frente a ≥3 soluciones.**

| Solución | Enlace | Qué hace | Diferencia de AquaSense IA |
|---|---|---|---|
| Flo by Moen | https://shop.moen.com/products/900-001 | Monitor y corte automático de agua con hardware instalado en la tubería | Es hardware propietario con app cerrada; AquaSense IA es software abierto, consultable en lenguaje natural y con trazas auditables |
| Phyn (Smart Water Assistant) | https://gearpatrol.com/2019/08/21/phyn-smart-water-assistant/ (reseña; verificar sitio oficial) | Detección de fugas por sensor de presión y corte | Ídem: caja negra de hardware; no explica sus decisiones ni separa roles con aprobación humana por acción |
| Buoy | [COMPLETAR — verificar enlace oficial; aparece en la misma reseña de Gear Patrol] | Control de agua doméstico con detección de fugas | Ídem |

*Innovación real y limitada:* no competimos en hardware (**nuestros sensores son simulados**). La novedad es la **arquitectura**: agentes con *mínimo privilegio* (solo uno puede proponer acciones y ninguno ejecutarlas), reglas críticas en código determinista, aprobación humana por acción y trazabilidad completa de cada decisión.

**B4. Categoría de tecnología emergente.** **IA agéntica** (principal: orquestación de agentes con *function calling*), con **IoT** (simulado) y **cloud** (despliegue en contenedor). Es la adecuada porque el problema exige encadenar pasos con decisiones condicionales (leer → diagnosticar → *solo si hay fuga* proponer) y justificar cada paso.

**B5. Resultado medible.** Meta: reducir el tiempo entre que una fuga ocurre y que una persona recibe una propuesta de acción justificada, de "hasta el siguiente ciclo de facturación" a **segundos**. Métricas que sí medimos: latencia p50/p95 de una consulta completa, % de casos de aceptación correctos y costo por 100 consultas, con `scripts/medir.js` sobre la URL pública. Valores obtenidos: [COMPLETAR].

**B6. Objetivos.** *General:* construir y desplegar un sistema multiagente que detecte fugas de agua y proponga acciones con supervisión humana. *Específicos:* (1) implementar un Coordinador y cuatro agentes con herramientas acotadas; (2) garantizar que ninguna acción se ejecute sin aprobación humana y que toda decisión quede en una traza; (3) desplegar el sistema en HTTPS y evaluarlo con una batería de casos.

## C. Requerimientos funcionales

**C1.**

| Código | Requerimiento funcional | Prioridad | Agente(s) | Criterio de aceptación verificable |
|---|---|---|---|---|
| RF-01 | Leer caudal y presión de los sensores | Alta | Sensor | `consultarLecturas` devuelve los 4 sensores con unidades (traza, caso C2) |
| RF-02 | Calcular riesgo de fuga por sensor con umbral individual y confirmarla | Alta | Detección | Con fuga provocada en `cocina`, `fugas:["cocina"]` (T1, C1) |
| RF-03 | Atender consultas en lenguaje natural delegando en agentes | Alta | Coordinador | La traza muestra ≥ 1 evento `delegacion` (T1) |
| RF-04 | Proponer acciones solo si hay fuga confirmada | Alta | Ejecutor | Sin fuga, 0 propuestas aunque se pida cerrar (T8, C6) |
| RF-05 | Aprobar, posponer o descartar cada propuesta | Alta | Persona | `POST …/aprobar` cierra la válvula del simulador; una segunda decisión da 409 (A2) |
| RF-06 | Registrar una traza auditable por consulta | Alta | Orquestador | `GET /api/agentes/trazas/:id` devuelve entrada, delegaciones, herramientas y respuesta (A2) |
| RF-07 | Proyectar el consumo a N días | Media | Predictivo | Caso C3 incluye al Agente Predictivo |
| RF-08 | Rechazar consultas fuera del dominio | Media | Coordinador | Caso C4: 0 delegaciones (T3) |
| RF-09 | Resistir intentos de inyección de instrucciones | Alta | Orquestador | Caso C5/C8: sospecha registrada, 0 acciones (T4) |
| RF-10 | Mantener historial de decisiones | Media | Ejecutor / Persona | `GET /api/agentes/historial` lista la aprobación (A2) |
| RF-11 | Panel, alertas, analítica y reportes (interfaz heredada del prototipo) | Baja | — | Visibles en la interfaz; datos simulados |

**C2. Flujo principal.** (1) La persona escribe en el chat; (2) la interfaz envía el mensaje y un *snapshot* de las lecturas a `POST /api/agentes/solicitud`; (3) el servidor sanea el mensaje, lo limita a 500 caracteres y detecta patrones de inyección; (4) el Coordinador decide a quién delegar; (5) Sensor lee, Detección calcula el riesgo; (6) si hay fuga confirmada, el Ejecutor **propone** cerrar la válvula y avisar a la EPS; (7) el Coordinador redacta la respuesta; (8) la interfaz muestra la respuesta, la ruta de agentes y añade las propuestas a "Acciones pendientes"; (9) la persona decide; (10) la decisión se registra en el historial y la traza queda consultable. Diagrama: `docs/ARQUITECTURA.md`.

**C3. Actores.** *Usuario/operador:* consulta, aprueba, pospone o descarta propuestas, ve trazas. *Agentes:* Coordinador, Sensor, Detección, Predictivo y Ejecutor (cada uno con su lista de herramientas). *Administrador del despliegue:* configura variables de entorno y límites. *Sistemas externos:* API de Groq (LLM) y, opcionalmente, SQL Server. *No hay sensores físicos.*

**C4. Fuera de alcance (MVP).** Sensores/válvulas físicas (se simulan); autenticación y multiusuario; notificaciones reales a la EPS, WhatsApp o correo (la pestaña "WhatsApp" de la interfaz es una maqueta); modelo de ML entrenado con datos reales (la detección es una heurística transparente); RAG sobre documentos; persistencia obligatoria (opcional con SQL Server). Se excluyeron por plazo y porque exigen hardware o datos reales que no tenemos.

## D. Requerimientos técnicos y no funcionales

**D1. Tecnologías y versiones.**

| Componente | Versión |
|---|---|
| Node.js | 22 (imagen `node:22-alpine`); mínimo 18 |
| Express | 4.22.3 (lockfile; rango `^4.19.2`) |
| cors / dotenv | 2.8.6 / 16.6.1 |
| mssql (SQL Server, opcional) | 11.0.2 (driver `tedious` 18.6.2) |
| SQL Server (opcional) | 2022 |
| Frontend | HTML + CSS + JavaScript sin dependencias externas |
| LLM | Groq API: `openai/gpt-oss-120b` y `openai/gpt-oss-20b` |
| Pruebas | `node:test` (incluido en Node) |

**D2. No funcionales y cómo se verifican.**

| Requisito | Meta | Verificación |
|---|---|---|
| Tiempo de respuesta | p95 ≤ [COMPLETAR — definir tras medir] s por consulta completa | `scripts/medir.js` en la URL pública |
| Disponibilidad | `/health` responde 200 | Healthcheck de Docker y de la plataforma; nota: el plan gratuito duerme tras inactividad |
| Seguridad | Sin secretos en repo/navegador; límites; CSP | Pruebas A1, A3, A4, S1–S3, T4; revisión del repo |
| Privacidad | Sin datos personales por diseño | Ver H1 |
| Costo por consulta | Ver F4 | Campo `costoUsd` de cada traza |

**D3. Datos y licencias.** Los datos de sensores son **simulados** (generados por el código; sin fuente externa, formato JSON, 4 sensores). No hay documentos ni conjuntos de datos de terceros. La cifra de B1 se cita con enlace. Licencia del código: [COMPLETAR — p. ej. MIT; agregar archivo LICENSE si el equipo lo decide].

**D4. Almacenamiento y protección.** Por defecto todo vive **en memoria** del servidor (acciones, trazas —máx. 200—, memoria de conversación —6 turnos, 30 min—) y se pierde al reiniciar. Con `STORAGE=sqlserver` se replican trazas y decisiones en SQL Server 2022. Protecciones: variables de entorno para credenciales; consultas SQL parametrizadas; el error interno no se devuelve al cliente; HTTPS lo aporta la plataforma de despliegue. **Pendiente/limitación:** sin cifrado en reposo propio ni copias de respaldo automáticas (con SQL Server, usar los respaldos del motor); `DB_ENCRYPT` y `DB_TRUST_SERVER_CERT` deben endurecerse en producción.

**D5. Diagrama de arquitectura.** `docs/ARQUITECTURA.md` (Mermaid; GitHub lo dibuja). Componentes y archivos descritos en la tabla del mismo documento.

## E. Arquitectura multiagente (requisito eliminatorio)

**E1. Tabla de agentes.**

| Agente | Rol y objetivo | Herramientas | Entradas | Salidas | Modelo |
|---|---|---|---|---|---|
| Coordinador | Interpretar la consulta, delegar y redactar la respuesta (máx. 120 palabras) | `delegar_a_agente` | Mensaje del usuario (delimitado como dato), historial de sesión, informes de agentes | Respuesta final en español | `openai/gpt-oss-120b` (Groq) |
| Agente Sensor | Leer caudal y presión | `consultarLecturas`, `medirPresion` | Tarea del Coordinador | JSON `{resumen, hallazgos, datos}` con lecturas | `openai/gpt-oss-20b` (Groq) |
| Agente Detección | Clasificar patrones, calcular riesgo y confirmar fuga | `analizarPatron`, `calcularRiesgoFuga` | Tarea del Coordinador | JSON con `datos.fugas` y riesgo por sensor | `openai/gpt-oss-20b` |
| Agente Predictivo | Proyectar consumo a N días (extrapolación lineal) | `proyectarConsumo` | Tarea del Coordinador | JSON con proyección y nivel de riesgo | `openai/gpt-oss-20b` |
| Agente Ejecutor | **Proponer** cierre de válvula, aviso a la EPS o mantenimiento; dejar constancia | `proponerAccion`, `registrarDecision` | Tarea con `sensorId` | Propuestas en estado `pendiente` | `openai/gpt-oss-20b` |

**E2. Patrón de orquestación.** **Supervisor con delegación (handoff)**: el Coordinador llama a `delegar_a_agente` de forma dinámica y secuencial. Lo elegimos porque el flujo es condicional (el Ejecutor solo actúa si Detección confirma una fuga; las consultas fuera de dominio no deben gastar llamadas) y porque centraliza la trazabilidad y los límites.

**E3. Framework.** **Código propio** en Node.js (`server/src/agents/orquestador.js`) sobre la API compatible con OpenAI de Groq; sin LangGraph/CrewAI. Versión: 2.0.0 del repositorio. Motivo: control total de los límites, de la lista blanca de herramientas y del formato de la traza.

**E4. Comunicación entre agentes.** Mensajes estructurados en **JSON**: el Coordinador entrega `{agente, tarea}` y cada especialista responde `{resumen, hallazgos, datos}`, que el orquestador valida (un reintento de formato). El informe vuelve al Coordinador como resultado de la herramienta `delegar_a_agente`. Cada intercambio se registra como evento `delegacion` y `mensaje_agente`. No se usan MCP ni A2A.

**E5. Memoria y estado.** *Estado de la solicitud:* lo mantiene el orquestador (resultados de agentes, contadores, límites). *Memoria de conversación:* últimos 6 turnos por `sesionId`, en memoria, 30 min. *Compartido:* almacén de acciones (propuestas), historial de decisiones y trazas. Cada especialista **no recuerda nada** entre solicitudes: recibe solo su tarea. No hay base vectorial.

**E6. Decisiones por agente y delegación.** *Cada especialista decide:* qué herramienta invocar y cómo resumir sus hallazgos. *El Coordinador decide:* a quién delegar, en qué orden y cuándo responder. *El código decide* (no el LLM): el riesgo de fuga, si una fuga se confirma y si se admite una propuesta. *Una persona decide:* aprobar, posponer o descartar. **Caso de delegación (traza real de ejemplo, modo simulado):** el Coordinador delega al Sensor, luego a Detección ("calcula el riesgo…"); Detección devuelve `fugas:["cocina"]` y el Coordinador delega al Ejecutor con "propón acciones para sensorId=cocina". Ver `docs/evidencias/ejemplos-locales-mock/traza-*.md`.

**E7. Bucles, errores en cadena y acciones no deseadas.** Tabla de límites en `docs/ARQUITECTURA.md`: 6 pasos del Coordinador, 4 por especialista, 5 delegaciones, 14 llamadas al LLM y 45 s por solicitud, 3 s por herramienta, 500 llamadas/día. Validación de la salida de cada especialista con un reintento; validación de argumentos de cada herramienta; **lista blanca** de herramientas por agente (si piden otra, se bloquea y se registra); reintentos con retroceso solo ante 429/5xx; al agotar un límite se responde con lo ya reunido (`abortado` en la traza). Probado en T5, T6, T7, T9, T10, T11.

**E8. Human-in-the-loop.** **Toda acción** (cerrar válvula, notificar a la EPS, mantenimiento) requiere aprobación humana: el Ejecutor solo crea propuestas `pendiente`. La persona las aprueba, pospone o descarta en "Acciones pendientes" y la decisión se registra. *Única excepción:* el interruptor "Corte automático de suministro" de Configuración (heredado del prototipo, **desactivado por defecto**), que opera sobre la simulación local y queda registrado en el historial.

**E9. Evidencia obligatoria (traza real).** Ejecutar contra la URL pública: `node scripts/capturar-traza.js <URL>` → genera `docs/evidencias/traza-*.md/json` con entrada, mensajes entre agentes, herramientas y respuesta final. Adjuntar el `.md` y una captura del panel *Agentes → Trazas*. [COMPLETAR — enlace a la traza real]. *Existe una traza de ejemplo en modo simulado en `docs/evidencias/ejemplos-locales-mock/`; **no** sirve como evidencia del LLM real y está rotulada como tal.*

**E10. ¿Por qué no un solo agente?** Un solo prompt podría responder a una consulta sencilla; nuestras razones son de ingeniería, no de capacidad: (1) **mínimo privilegio**: si un único agente tuviera todas las herramientas, una inyección podría llegar a la que crea propuestas; separado, el Ejecutor se desactiva solo ante sospechas; (2) **auditabilidad**: cada agente deja su propio rastro y se puede ver quién hizo qué; (3) **costo y latencia**: los especialistas usan un modelo 6 veces más pequeño; (4) **flujo condicional** que el Coordinador decide en cada consulta. *Si se elimina…* **Sensor:** nadie lee datos y los demás no tienen entrada; **Detección:** no hay confirmación de fuga y el Ejecutor no puede justificar propuestas; **Predictivo:** se pierde la proyección (el resto sigue funcionando); **Ejecutor:** el sistema solo diagnostica, sin propuestas ni registro de decisiones; **Coordinador:** no hay quien decida el orden ni redacte la respuesta. *Salvedad honesta:* para este MVP la lógica de detección es simple; el beneficio de separar agentes crecería con herramientas más complejas.

## F. Modelos de IA, datos y costos

**F1. Modelos.** Proveedor: **Groq**. Coordinador: `openai/gpt-oss-120b` (mejor razonamiento para decidir la delegación y redactar). Especialistas: `openai/gpt-oss-20b` (más barato y rápido para tareas acotadas con herramientas). Ambos admiten *tool use* en Groq. Privacidad: no se envían datos personales; el prompt incluye lecturas simuladas y el mensaje del usuario. *Riesgo conocido:* si el 20B fallara al usar herramientas, cambiar `MODEL_ESPECIALISTA=openai/gpt-oss-120b` (una variable, sin tocar código). [COMPLETAR — confirmar con la traza real qué modelo se usó].

**F2. API o local.** Por **API** (Groq). No se ejecuta ningún modelo local.

**F3. RAG.** **No usa RAG.** No hay documentos que consultar: los hechos provienen de herramientas deterministas sobre los datos de sensores. Cómo se comprueba que una cifra de la respuesta es real: cada cifra debe aparecer en el resultado de una herramienta, visible en la traza. *Limitación:* esa regla se exige por prompt y se verifica revisando la traza; no hay un validador automático de cifras.

**F4. Costo y límites.** Precios (verificar en https://groq.com/pricing): 120B US$ 0.15 / 0.60 y 20B US$ 0.075 / 0.30 por millón de tokens (entrada/salida). **Estimación previa** para una consulta completa con fuga (≈ 4 llamadas del Coordinador + 6 de especialistas): ~9 000 tokens de entrada y ~900 de salida → **≈ US$ 0.14 por 100 consultas**; como gpt-oss genera tokens de razonamiento, el rango razonable es **US$ 0.10–0.50 por 100 consultas**. *Es una estimación; reemplazar por el valor medido* (`costoUsd` en las trazas; `medir.js` lo agrega): [COMPLETAR]. Límites configurados: `LLM_MAX_TOKENS=1500` por llamada, 14 llamadas por solicitud, `RATE_LIMIT_POR_MIN=20` por IP, `TOPE_DIARIO_LLM=500`. Con ese tope el gasto máximo diario en el peor caso es ≈ **US$ 0.56** (500 llamadas × 1 500 tokens de entrada y salida al precio del modelo grande).

**F5. Clave de API.** Propia del equipo [COMPLETAR — confirmar]. Variable `GROQ_API_KEY`, solo en el entorno del servidor (panel de la plataforma o `.env` local ignorado por Git). El navegador no recibe ninguna clave.

## G. Despliegue en línea

**G1.** ☒ Chatbot web con IA (con agentes en segundo plano de tipo orquestado).

**G2. Servicio.** [COMPLETAR — p. ej. Render, con Docker desde GitHub (`render.yaml`)]. Despliegue: *push* a GitHub → la plataforma construye el `Dockerfile`.

**G3. Archivos.** ☒ `Dockerfile` ☒ `docker-compose.yml` ☒ `.env.example` ☒ `README.md` con pasos ☒ `.github/workflows/ci.yml` (pruebas + build).

**G4. Variables de entorno (nombres).** `GROQ_API_KEY` (clave del LLM) · `LLM_MODE` (groq|mock) · `MODEL_COORDINADOR`, `MODEL_ESPECIALISTA` (modelos) · `LLM_REASONING_EFFORT`, `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `LLM_REINTENTOS` · `MAX_PASOS_COORDINADOR`, `MAX_PASOS_ESPECIALISTA`, `MAX_LLAMADAS_LLM`, `MAX_DELEGACIONES`, `TIMEOUT_SOLICITUD_MS`, `TIMEOUT_HERRAMIENTA_MS` (anti-bucle) · `MAX_MENSAJE_CHARS`, `RATE_LIMIT_POR_MIN`, `RATE_LIMIT_GENERAL_POR_MIN`, `TOPE_DIARIO_LLM` (consumo) · `PRECIO_*_USD_M` (estimación de costo) · `STORAGE`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_USE_WINDOWS_AUTH`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT` (SQL Server opcional) · `ALLOWED_ORIGINS` (CORS) · `ENABLE_SIMULADOR` · `PORT`.

**G5. Endpoint de salud.** `<URL>/health` → JSON con `ok:true`, `llm.modo` (debe decir `groq` en producción), `db` y contadores. [COMPLETAR — pegar la respuesta real].

**G6. Usuario de prueba.** **No requiere registro ni usuario.** El docente puede: abrir la URL, pulsar *Simular fuga*, ir a *Asistente* y escribir "¿Hay alguna fuga activa ahora mismo?"; o usar `POST <URL>/api/simulador/fuga {"sensorId":"cocina"}` y luego `POST <URL>/api/agentes/solicitud`. Nota: el simulador del servidor es compartido entre visitantes.

**G7. Tiempo de respuesta y concurrencia.** [COMPLETAR — salida de `node scripts/medir.js <URL> 3 --concurrencia=5`: latencia p50/p95 y usuarios simultáneos].

## H. Seguridad y ética

**H1. Datos personales.** El sistema **no procesa datos personales por diseño**: los sensores son simulados y no se pide ningún dato de identidad. Lo único que podría contener datos personales es el texto libre que escriba el usuario; se limita a 500 caracteres, se guarda solo en memoria (máx. 200 trazas) o, si se activa, en SQL Server, y no se comparte con terceros salvo con el proveedor del LLM para responder. Marco: Ley N.º 29733 de Protección de Datos Personales (Perú); [COMPLETAR — confirmar con el docente si se requiere aviso de privacidad en la interfaz]. Recomendación: no escribir datos reales en el chat de la demo.

**H2. Inyección de instrucciones y alucinaciones.** *Inyección:* saneo de la entrada; mensaje delimitado como dato con la instrucción explícita de no obedecerlo; detección heurística (9 familias de patrones ES/EN) que **desactiva al Ejecutor** en esa solicitud y avisa al usuario; resultados de agentes y herramientas tratados como datos; lista blanca de herramientas; la acción crítica depende de código, no de lo que diga el LLM; los nombres de sensores del cliente se limpian de HTML; la salida se escapa en la interfaz. *Alucinaciones:* las cifras salen de herramientas, no del modelo; prompt que prohíbe inventar; hechos críticos (riesgo y confirmación) calculados por código; traza para verificar. *Limitaciones:* la detección de inyección es heurística y puede fallar ante formulaciones nuevas; el control de cifras inventadas es por prompt, no automático.

**H3. Acciones que no puede ejecutar sin autorización.** Cerrar válvulas, avisar a la EPS y programar mantenimiento: ninguna se ejecuta; solo se proponen. Tampoco puede enviar mensajes, pagar ni borrar datos: no existen herramientas para ello.

**H4. Auditoría.** Sí. Cada consulta genera una traza (entrada, llamadas al LLM con modelo/tokens/tiempo, delegaciones, herramientas con argumentos y resultados, mensajes entre agentes, bloqueos y respuesta). Se ve en *Agentes → Trazas de los agentes*, en `GET /api/agentes/trazas` y, opcionalmente, en la tabla `TrazasAgentes` de SQL Server. Las decisiones humanas quedan en `GET /api/agentes/historial`.

**H5. Riesgos éticos.** *Falsa sensación de seguridad:* un falso negativo no avisaría de una fuga real → es un prototipo con datos simulados y no sustituye a una inspección. *Falso positivo:* cerrar el agua innecesariamente → por eso hay aprobación humana. *Uso indebido:* manipular el sistema para cortar el suministro → defensas de H2 y ninguna ejecución automática. *Sesgo:* la heurística asume un consumo base por sensor; consumos legítimamente altos (visitas, riego) pueden marcarse como fuga → umbral ajustable por sensor. *Empleo:* apoya a técnicos y administradores, no los reemplaza; las decisiones siguen siendo humanas. *Transparencia:* el sistema declara cuando está en modo simulado.

## I. Pruebas y evidencias

**I1.** Matriz de 8 casos de aceptación y 34 pruebas automáticas: `docs/MATRIZ_PRUEBAS.md` (columna "¿Pasó en la URL pública?": [COMPLETAR]).

**I2. Métricas.** Resultados reales en modo simulado y plantilla para los valores en línea: `docs/MATRIZ_PRUEBAS.md` §3. Método: `scripts/medir.js`. Valores sobre la URL pública con LLM real: [COMPLETAR].

**I3. Caso de falla.** Propuestas duplicadas que desaparecían al repetir la consulta; detectado con `medir.js` (3 repeticiones), corregido y cubierto por las pruebas T15/T16. Detalle y otras fallas del proyecto original en `docs/MATRIZ_PRUEBAS.md` §4.

**I4. Capturas.** [COMPLETAR — de la URL pública: chat con la ruta de agentes, bandeja de acciones pendientes, panel de trazas, `/health`]. Capturas locales de referencia: `docs/evidencias/capturas-locales/`.

## J. Gestión del proyecto

**J1. Metodología y cronograma.** [COMPLETAR — p. ej. iteraciones semanales; hitos: prototipo de interfaz y SQL Server → orquestador multiagente → pruebas y límites → despliegue → evidencias y video; marcar entregado/pendiente].

**J2. Aportes por integrante.** [COMPLETAR — enlazar commits/módulos de cada uno en GitHub]. *Nota:* el zip recibido no incluía historial de Git; el repositorio debe subirse con commits reales de cada integrante.

**J3. Aprendizajes y mejoras.** [COMPLETAR con la experiencia del equipo]. Mejoras técnicas ya identificadas: sensores reales (ESP32 + caudalímetro) enviando lecturas; detector estadístico o ML entrenado con datos reales; autenticación y multiusuario; notificaciones reales con confirmación; validador automático de cifras en la respuesta; memoria persistente.

## K. Declaración final

- ☐ K1. Declaro que las respuestas coinciden con las de mi equipo y que el sistema se encuentra en línea y funcionando en la URL indicada.
- ☐ K2. Declaro que no incluí claves, contraseñas ni datos personales reales en el repositorio. *(Antes de marcar: verifiquen con `git log -p | grep -i -E "gsk_|password|secret"` y roten cualquier clave que haya estado en el zip anterior.)*
- ☐ K3. Declaro que el sistema usa agentes que colaboran entre sí y que puedo explicar su funcionamiento en una sustentación oral.
