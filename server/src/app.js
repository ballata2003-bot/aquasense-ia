// Construye la aplicación Express. Recibe dependencias para poder probarla con un LLM simulado.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTES } from './agents/definiciones.js';
import { HERRAMIENTAS } from './agents/herramientas.js';
import { ejecutarSolicitud } from './agents/orquestador.js';
import { ValidationError } from './errores.js';
import { cabecerasSeguridad, crearLimitador } from './seguridad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '2.0.0';

export function crearApp(deps) {
  const { cfg, llm, simulador, acciones, decisiones, trazas } = deps;
  const publicDir = deps.publicDir || path.resolve(__dirname, '../../public');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cabecerasSeguridad);
  // Sin ALLOWED_ORIGINS no se envían cabeceras CORS: solo el mismo origen puede usar la API desde un navegador.
  if (cfg.allowedOrigins.length) app.use(cors({ origin: cfg.allowedOrigins }));
  app.use(express.json({ limit: '50kb' }));

  // ---- Salud ----
  async function salud(req, res) {
    let db = 'no configurado';
    if (cfg.storage === 'sqlserver') {
      try {
        const { getPool } = await import('./db.js');
        await Promise.race([getPool(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
        db = 'conectado';
      } catch { db = 'desconectado'; }
    }
    const est = llm.estado();
    res.json({
      ok: true, servicio: 'aquasense-ia', version: VERSION, hora: new Date().toISOString(),
      uptimeS: Math.round(process.uptime()), db,
      llm: {
        modo: est.modo,
        ...(est.modo === 'mock' ? { advertencia: 'Respuestas SIMULADAS (no es un modelo real). Define GROQ_API_KEY para usar el LLM.' } : {}),
        modeloCoordinador: cfg.modeloCoordinador, modeloEspecialista: cfg.modeloEspecialista,
        llamadasHoy: est.llamadasHoy, topeDiario: est.topeDiario,
      },
      trazasEnMemoria: trazas.total(),
    });
  }
  app.get('/health', salud);
  app.get('/api/health', salud);

  app.use('/api', crearLimitador({ max: cfg.rateLimitGeneralPorMin }));
  const limiteSolicitudes = crearLimitador({ max: cfg.rateLimitPorMin });

  // ---- Agentes ----
  app.get('/api/agentes/info', (req, res) => {
    res.json({
      patron: 'supervisor con delegación (handoff)',
      agentes: Object.entries(AGENTES).map(([clave, a]) => ({
        clave, nombre: a.nombre, rol: a.rol, herramientas: a.herramientas,
        modelo: a.modelo === 'coordinador' ? cfg.modeloCoordinador : cfg.modeloEspecialista,
      })),
      herramientas: Object.entries(HERRAMIENTAS).map(([n, h]) => ({ nombre: n, descripcion: h.descripcion })),
      limites: {
        maxPasosCoordinador: cfg.maxPasosCoordinador, maxPasosEspecialista: cfg.maxPasosEspecialista,
        maxLlamadasLlm: cfg.maxLlamadasLlm, maxDelegaciones: cfg.maxDelegaciones,
        timeoutSolicitudMs: cfg.timeoutSolicitudMs, maxMensajeChars: cfg.maxMensajeChars, topeDiarioLlm: cfg.topeDiarioLlm,
      },
    });
  });

  app.post('/api/agentes/solicitud', limiteSolicitudes, async (req, res, next) => {
    try {
      const { mensaje, contexto, sesionId } = req.body || {};
      const r = await ejecutarSolicitud({ mensaje, contexto, sesionId }, deps);
      res.json(r);
    } catch (e) { next(e); }
  });

  app.get('/api/agentes/trazas', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
    res.json(trazas.listar(limit, req.query.completo === '1'));
  });
  app.get('/api/agentes/trazas/:id', (req, res) => {
    const t = trazas.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Traza no encontrada.' });
    res.json(t);
  });

  // ---- Human-in-the-loop: los agentes solo proponen; una persona decide ----
  app.get('/api/agentes/acciones', (req, res) => res.json(acciones.listar(req.query.estado)));
  const DECISIONES = { aprobar: 'aprobada', posponer: 'pospuesta', descartar: 'descartada' };
  app.post('/api/agentes/acciones/:id/:decision', (req, res) => {
    const estado = DECISIONES[req.params.decision];
    if (!estado) return res.status(400).json({ error: 'Decisión inválida. Usa aprobar, posponer o descartar.' });
    const r = acciones.decidir(req.params.id, estado);
    if (r.error === 'no_existe') return res.status(404).json({ error: 'La acción no existe.' });
    if (r.error === 'no_pendiente') return res.status(409).json({ error: `La acción ya está ${r.accion.estado}.` });
    const a = r.accion;
    let efecto = 'sin efecto físico';
    if (estado === 'aprobada' && a.tipo === 'cerrar_valvula') { simulador.cerrarValvula(a.sensorId); efecto = 'válvula cerrada (simulador)'; }
    decisiones.registrar({ sensorNombre: a.sensorNombre, evento: a.tipoEtiqueta, decididoPor: 'Manual (usuario)', resultado: `${estado} · ${efecto}`, trazaId: a.trazaId });
    res.json({ ok: true, accion: a, efecto });
  });
  app.get('/api/agentes/historial', (req, res) => res.json(decisiones.listar(Math.min(parseInt(req.query.limit, 10) || 50, 200))));

  // ---- Simulador del servidor (demo/pruebas) ----
  if (cfg.habilitarSimulador) {
    app.get('/api/simulador/estado', (req, res) => res.json({ sensores: simulador.snapshot() }));
    app.post('/api/simulador/fuga', (req, res) => {
      const id = req.body?.sensorId;
      if (typeof id !== 'string' || !simulador.provocarFuga(id)) return res.status(400).json({ error: `sensorId inválido. Opciones: ${simulador.ids().join(', ')}` });
      res.json({ ok: true, sensorId: id });
    });
    app.post('/api/simulador/reset', (req, res) => { simulador.reset(); const canceladas = acciones.cancelarPendientes('Sistema (reset del simulador)'); res.json({ ok: true, propuestasCanceladas: canceladas }); });
  }

  // ---- Persistencia SQL Server (opcional) ----
  if (cfg.storage === 'sqlserver') {
    deps.montarSql?.(app);
  } else {
    app.use(['/api/sensores', '/api/lecturas', '/api/alertas', '/api/acciones', '/api/historial'], (req, res) =>
      res.status(503).json({ error: 'Persistencia SQL Server no configurada (STORAGE=memory).' }));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0 }));

  // ---- Manejo de errores (sin filtrar detalles internos) ----
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Cuerpo demasiado grande.' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });
  return app;
}
