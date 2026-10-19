# Arquitectura de AquaSense IA

## Vista general (D5)

```mermaid
flowchart LR
    U["Usuario<br/>(navegador, HTTPS)"] --> W["Interfaz web<br/>public/index.html"]
    W -->|"POST /api/agentes/solicitud<br/>mensaje + snapshot de sensores"| API["Express<br/>app.js"]
    API --> S["Seguridad<br/>saneo · anti-inyección · rate limit"]
    S --> O["Orquestador<br/>(Coordinador, patrón supervisor)"]
    O -->|"delegar_a_agente"| A1["Agente Sensor"]
    O -->|"delegar_a_agente"| A2["Agente Detección"]
    O -->|"delegar_a_agente"| A3["Agente Predictivo"]
    O -->|"delegar_a_agente"| A4["Agente Ejecutor"]
    A1 & A2 & A3 & A4 --> T["Herramientas (lista blanca por agente)<br/>herramientas.js"]
    O & A1 & A2 & A3 & A4 <-->|"function calling"| LLM["Groq API<br/>gpt-oss-120b · gpt-oss-20b"]
    T --> CTX["Contexto de la solicitud<br/>snapshot de la interfaz o simulador"]
    A4 -->|"propuesta PENDIENTE"| ACC["Almacén de acciones"]
    ACC -->|"aprobar / posponer / descartar"| H["Persona (human-in-the-loop)"]
    H --> W
    O --> TR["Trazas · memoria de sesión · historial"]
    TR -.->|"opcional STORAGE=sqlserver"| DB[("SQL Server 2022")]
```

| Componente | Archivo | Función |
|---|---|---|
| Interfaz | `public/index.html` | Panel, chat, bandeja de aprobación, panel de trazas |
| API | `server/src/app.js` | Rutas, CORS restringido, CSP, rate limit, manejo de errores |
| Orquestador | `server/src/agents/orquestador.js` | Bucle del Coordinador, delegación, límites, traza |
| Definiciones | `server/src/agents/definiciones.js` | Prompts, herramientas permitidas por agente |
| Herramientas | `server/src/agents/herramientas.js` | Lógica determinista y validada; `proponerAccion` solo crea propuestas |
| Cliente LLM | `server/src/llm.js` | Groq (compatible OpenAI), timeout, reintentos, tope diario; modo `mock` |
| Almacenes | `server/src/almacenes.js` | Acciones, decisiones, trazas, memoria de sesión |
| Persistencia | `server/src/persistencia.js`, `db.js`, `schema.sql` | Réplica opcional en SQL Server |

## Flujo de una solicitud con fuga confirmada

```mermaid
sequenceDiagram
    actor P as Persona
    participant UI as Interfaz
    participant C as Coordinador (LLM)
    participant S as Agente Sensor
    participant D as Agente Detección
    participant E as Agente Ejecutor
    P->>UI: "¿Hay alguna fuga activa ahora mismo?"
    UI->>C: mensaje + snapshot de sensores
    C->>S: delegar_a_agente(sensor, "lee todos los sensores")
    S->>S: consultarLecturas()
    S-->>C: {resumen, hallazgos, datos} (JSON)
    C->>D: delegar_a_agente(deteccion, "calcula riesgo")
    D->>D: calcularRiesgoFuga()
    D-->>C: {fugas:["cocina"], ...}
    C->>E: delegar_a_agente(ejecutor, "propón acciones sensorId=cocina")
    E->>E: proponerAccion(cerrar_valvula) · proponerAccion(notificar_eps)
    E-->>C: propuestas PENDIENTES
    C-->>UI: respuesta + traza + propuestas
    UI-->>P: "…quedan pendientes de aprobación"
    P->>UI: Aprobar
    UI->>UI: POST /api/agentes/acciones/:id/aprobar → válvula cerrada (simulador)
```

## Decisiones de diseño

- **Patrón supervisor con delegación:** el Coordinador decide el orden dinámicamente (p. ej. solo llama al Ejecutor si Detección confirma una fuga). Un pipeline fijo no podría saltarse pasos ni responder fuera de dominio sin gastar llamadas.
- **Mínimo privilegio:** cada agente solo ve sus herramientas. El único que puede crear propuestas es el Ejecutor, y aun así no puede ejecutarlas. Si un LLM pidiera una herramienta ajena, el orquestador la bloquea y lo registra.
- **El LLM decide el flujo, el código decide los hechos:** el riesgo de fuga y la regla "no se propone cierre sin fuga confirmada" están en código determinista (`evaluarSensor`, `proponerAccion`), por lo que un modelo manipulado no puede saltárselas.
- **Modelos por rol:** modelo grande para coordinar y redactar; modelo pequeño (más barato y rápido) para tareas acotadas con herramientas.
- **Comunicación:** mensajes JSON estructurados `{resumen, hallazgos, datos}` validados por el orquestador (un reintento de formato; luego se tolera texto libre). No se usa MCP ni A2A.
- **Memoria:** estado de la solicitud en el orquestador; memoria de conversación por `sesionId` (últimos 6 turnos, 30 min); propuestas, historial y trazas en almacenes compartidos.

## Límites anti-bucle (E7)

| Control | Valor por defecto | Variable |
|---|---|---|
| Pasos del Coordinador | 6 | `MAX_PASOS_COORDINADOR` |
| Pasos por especialista | 4 | `MAX_PASOS_ESPECIALISTA` |
| Delegaciones por solicitud | 5 | `MAX_DELEGACIONES` |
| Llamadas al LLM por solicitud | 14 | `MAX_LLAMADAS_LLM` |
| Tiempo total por solicitud | 45 s | `TIMEOUT_SOLICITUD_MS` |
| Tiempo por herramienta | 3 s | `TIMEOUT_HERRAMIENTA_MS` |
| Timeout y reintentos del LLM | 20 s · 2 | `LLM_TIMEOUT_MS`, `LLM_REINTENTOS` |
| Llamadas al LLM por día | 500 | `TOPE_DIARIO_LLM` |

Al alcanzar un límite el sistema **no falla**: devuelve una respuesta parcial con lo que ya reunieron los agentes y marca `abortado` en la traza.
