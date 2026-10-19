# AquaSense IA — sistema multiagente para detección de fugas de agua

Un **Coordinador** (LLM) recibe la consulta del usuario y delega en agentes especializados, cada uno con su propio prompt, su propio bucle de *function calling* y una **lista blanca de herramientas**:

| Agente | Rol | Herramientas | Modelo (por defecto) |
|---|---|---|---|
| Coordinador | Interpreta, delega y redacta la respuesta | `delegar_a_agente` | `openai/gpt-oss-120b` |
| Agente Sensor | Lee caudal y presión | `consultarLecturas`, `medirPresion` | `openai/gpt-oss-20b` |
| Agente Detección | Patrones, riesgo y confirmación de fuga | `analizarPatron`, `calcularRiesgoFuga` | `openai/gpt-oss-20b` |
| Agente Predictivo | Proyección de consumo (demostrativa) | `proyectarConsumo` | `openai/gpt-oss-20b` |
| Agente Ejecutor | **Propone** acciones; nunca las ejecuta | `proponerAccion`, `registrarDecision` | `openai/gpt-oss-20b` |

**Human-in-the-loop:** las acciones (cerrar válvula, avisar a la EPS, mantenimiento) nacen como propuestas *pendientes*. Solo una persona puede aprobarlas, desde la interfaz o con `POST /api/agentes/acciones/:id/aprobar`.

> Los datos de los sensores son **simulados**. No hay hardware real conectado.

## Inicio rápido (local)

```bash
cd server
npm install
cp ../.env.example .env        # completa GROQ_API_KEY (clave PROPIA; nunca la subas a Git)
npm start                      # http://localhost:3001  ·  salud: /health
```

Sin `GROQ_API_KEY` el servidor arranca en **modo `mock`** (LLM simulado con reglas): sirve para probar el flujo, pero `/health` y la interfaz lo declaran como simulado y **no cuenta como evidencia del LLM real**.

## Docker

```bash
cp .env.example .env           # completa GROQ_API_KEY
docker compose up --build      # http://localhost:3001
```

Con SQL Server 2022 opcional: `docker compose --profile sqlserver up --build` y ejecuta `server/schema.sql` (ver comentarios en `docker-compose.yml`).

## Despliegue público (HTTPS)

Cualquier host que ejecute Docker sirve (Render, Railway, Fly.io…). Ejemplo con Render:

1. Sube este repositorio a GitHub (comprueba que **no** incluye `.env`).
2. En Render: *New → Blueprint* (usa `render.yaml`) o *Web Service → Docker*.
3. Define `GROQ_API_KEY` en el panel de variables de entorno.
4. Comprueba `https://TU-URL/health` → `"llm":{"modo":"groq"}`.

El plan gratuito de Render duerme el servicio tras inactividad: la primera petición puede tardar. Despiértalo antes de la demostración.

## Variables de entorno

Lista completa y comentada en [`.env.example`](.env.example). Las imprescindibles:

| Variable | Para qué sirve |
|---|---|
| `GROQ_API_KEY` | Clave de Groq (propia del equipo). Solo en el entorno del servidor. |
| `LLM_MODE` | `groq` o `mock`. Vacío = `groq` si hay clave, si no `mock`. |
| `MODEL_COORDINADOR` / `MODEL_ESPECIALISTA` | Modelos del Coordinador y de los especialistas. |
| `STORAGE` | `memory` (defecto) o `sqlserver` (persistencia opcional). |
| `RATE_LIMIT_POR_MIN`, `TOPE_DIARIO_LLM`, `MAX_*` | Límites de consumo y anti-bucle. |
| `DB_*` | Solo con `STORAGE=sqlserver`. |

## API

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servicio, modo del LLM, base de datos y contadores |
| `POST /api/agentes/solicitud` | `{ "mensaje": "...", "sesionId"?: "...", "contexto"?: { "sensores": [...] } }` → respuesta + traza completa |
| `GET /api/agentes/trazas?limit=10&completo=1` · `GET /api/agentes/trazas/:id` | Trazas de auditoría |
| `GET /api/agentes/acciones?estado=pendiente` | Propuestas del Agente Ejecutor |
| `POST /api/agentes/acciones/:id/{aprobar\|posponer\|descartar}` | Decisión humana |
| `GET /api/agentes/historial` | Historial de decisiones |
| `GET /api/agentes/info` | Agentes, herramientas, modelos y límites vigentes |
| `GET /api/simulador/estado` · `POST /api/simulador/fuga {sensorId}` · `POST /api/simulador/reset` | Simulador del servidor (demo/pruebas) |

Ejemplo (sin interfaz):

```bash
curl -s -X POST https://TU-URL/api/simulador/fuga -H 'Content-Type: application/json' -d '{"sensorId":"cocina"}'
curl -s -X POST https://TU-URL/api/agentes/solicitud -H 'Content-Type: application/json' \
     -d '{"mensaje":"¿Hay alguna fuga activa ahora mismo?"}' | jq '{agentes, respuesta, accionesPropuestas}'
```

## Pruebas y evidencias

```bash
cd server && npm test                                   # 34 pruebas automáticas (LLM simulado, sin red)
node scripts/capturar-traza.js https://TU-URL           # traza real (E9) → docs/evidencias/
node scripts/medir.js https://TU-URL 3 --concurrencia=5  # métricas en línea (I2, G7) → docs/evidencias/
```

## Seguridad (resumen)

Sin claves en el navegador ni en el repositorio · mensajes saneados y limitados · detección heurística de *prompt injection* (desactiva al Ejecutor en esa solicitud) · mensaje de usuario delimitado como dato · lista blanca de herramientas por agente · validación de argumentos · el cierre/aviso exige fuga confirmada **calculada por código**, no por el LLM · límites de pasos, llamadas, tiempo y tope diario · limitador de peticiones · cabeceras de seguridad y CSP · errores internos no se devuelven al cliente · salida del modelo escapada en la interfaz.

## Limitaciones conocidas

- Datos simulados; la "detección" es una heurística transparente (desviación sobre el consumo base), no un modelo de ML entrenado. La proyección es una extrapolación lineal demostrativa.
- Sin autenticación de usuarios: es una **demo pública** protegida por límites de uso. No la uses con datos reales sin añadir autenticación.
- El estado (acciones, trazas, memoria de conversación) vive en memoria y se pierde al reiniciar, salvo `STORAGE=sqlserver` para trazas y decisiones. El simulador del servidor es global (compartido entre visitantes).
- La integración con Groq se probó con un `fetch` simulado, no contra la API real desde este entorno: valida el primer despliegue con `scripts/capturar-traza.js`.

## Estructura

```
public/index.html            Interfaz (panel, chat multiagente, aprobación humana, trazas)
server/server.js             Arranque
server/src/app.js            Rutas HTTP y middlewares
server/src/agents/           orquestador · definiciones (prompts y lista blanca) · herramientas · contexto · mock
server/src/{llm,almacenes,seguridad,simulador,persistencia,config}.js
server/routes-sql.js · db.js · schema.sql   Persistencia opcional en SQL Server
server/test/                 Pruebas (node:test)
scripts/                     medir.js · capturar-traza.js · casos-prueba.json
docs/                        Arquitectura, cuestionario respondido, matriz de pruebas, guía de entrega, evidencias
```
