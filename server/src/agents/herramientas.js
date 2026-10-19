// Herramientas (function calling) que los agentes pueden invocar.
// Cada herramienta valida sus argumentos y trabaja SOLO sobre `ctx` (datos de la solicitud).
// Ninguna herramienta ejecuta acciones físicas: `proponerAccion` solo crea una propuesta PENDIENTE.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r1 = (x) => Math.round(x * 10) / 10;
const limpiar = (s, max) => String(s ?? '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export const TIPOS_ACCION = {
  cerrar_valvula: 'Cerrar válvula de suministro',
  notificar_eps: 'Notificar a la EPS',
  mantenimiento: 'Programar mantenimiento preventivo',
};

// ---- Lógica de evaluación (determinista y transparente; no es un modelo de ML) ----
export function evaluarSensor(s) {
  const desviacionCaudalPct = ((s.caudal - s.base) / Math.max(s.base, 0.5)) * 100;
  const desviacionPresionPct = ((s.presion - s.presionBase) / Math.max(s.presionBase, 0.5)) * 100;
  const presionAnomala = Math.abs(desviacionPresionPct) > 25;
  const riesgoPct = clamp(Math.round(desviacionCaudalPct), 0, 100);
  const confianzaPct = clamp(riesgoPct + (riesgoPct >= 30 && presionAnomala ? 10 : 0), 0, 100);
  const fugaConfirmada = !s.valvulaCerrada && riesgoPct >= s.umbral;
  let patron = 'normal';
  if (s.caudal === 0 || s.valvulaCerrada) patron = 'caudal_nulo';
  else if (desviacionCaudalPct >= 30) patron = 'sobreconsumo';
  return {
    sensorId: s.id, nombre: s.nombre, desviacionCaudalPct: r1(desviacionCaudalPct),
    desviacionPresionPct: r1(desviacionPresionPct), presionAnomala, patron,
    riesgoPct, confianzaPct, umbralPct: s.umbral, fugaConfirmada,
  };
}

function seleccionar(ctx, args) {
  const id = args?.sensorId;
  if (id === undefined || id === null || id === '' || id === 'todos') return { sensores: ctx.sensores };
  const s = ctx.sensores.find(x => x.id === id);
  if (!s) return { error: `El sensor "${limpiar(id, 40)}" no existe. Sensores válidos: ${ctx.sensores.map(x => x.id).join(', ')}.` };
  return { sensores: [s] };
}

const esquemaSensorOpcional = {
  type: 'object',
  properties: { sensorId: { type: 'string', description: 'Id del sensor (p. ej. "cocina"). Omitir o "todos" para todos.' } },
  additionalProperties: false,
};

export const HERRAMIENTAS = {
  consultarLecturas: {
    descripcion: 'Devuelve el caudal (L/min) y la presión (bar) actuales de uno o todos los sensores.',
    parametros: esquemaSensorOpcional,
    ejecutar(args, ctx) {
      const sel = seleccionar(ctx, args); if (sel.error) return sel;
      return {
        fuente: ctx.fuente,
        sensores: sel.sensores.map(s => ({
          sensorId: s.id, nombre: s.nombre, caudalLMin: s.caudal, presionBar: s.presion,
          consumoBaseLMin: s.base, presionBaseBar: s.presionBase, valvulaCerrada: s.valvulaCerrada,
        })),
      };
    },
  },
  medirPresion: {
    descripcion: 'Compara la presión actual con la presión base del sensor e indica si es anómala (>25% de desviación).',
    parametros: esquemaSensorOpcional,
    ejecutar(args, ctx) {
      const sel = seleccionar(ctx, args); if (sel.error) return sel;
      return {
        sensores: sel.sensores.map(s => {
          const e = evaluarSensor(s);
          return { sensorId: s.id, presionBar: s.presion, presionBaseBar: s.presionBase, desviacionPct: e.desviacionPresionPct, anomala: e.presionAnomala };
        }),
      };
    },
  },
  analizarPatron: {
    descripcion: 'Clasifica el patrón de consumo (normal, sobreconsumo, caudal_nulo) según la desviación sobre el consumo base.',
    parametros: esquemaSensorOpcional,
    ejecutar(args, ctx) {
      const sel = seleccionar(ctx, args); if (sel.error) return sel;
      return {
        sensores: sel.sensores.map(s => {
          const e = evaluarSensor(s);
          return { sensorId: s.id, patron: e.patron, desviacionCaudalPct: e.desviacionCaudalPct, presionAnomala: e.presionAnomala };
        }),
      };
    },
  },
  calcularRiesgoFuga: {
    descripcion: 'Calcula el riesgo de fuga (0-100) y si se confirma al superar el umbral individual del sensor.',
    parametros: esquemaSensorOpcional,
    ejecutar(args, ctx) {
      const sel = seleccionar(ctx, args); if (sel.error) return sel;
      const sensores = sel.sensores.map(s => {
        const e = evaluarSensor(s);
        if (e.fugaConfirmada) ctx.fugasConfirmadas.add(s.id);
        return { sensorId: s.id, nombre: s.nombre, riesgoPct: e.riesgoPct, confianzaPct: e.confianzaPct, umbralPct: e.umbralPct, fugaConfirmada: e.fugaConfirmada };
      });
      return { fugas: sensores.filter(x => x.fugaConfirmada).map(x => x.sensorId), sensores };
    },
  },
  proyectarConsumo: {
    descripcion: 'Extrapola linealmente el caudal a N días (1-30) a partir de la tendencia actual frente a la base. Estimación demostrativa.',
    parametros: {
      type: 'object',
      properties: {
        sensorId: { type: 'string' },
        horizonteDias: { type: 'integer', minimum: 1, maximum: 30, description: 'Días hacia adelante (por defecto 7).' },
      },
      additionalProperties: false,
    },
    ejecutar(args, ctx) {
      const sel = seleccionar(ctx, args); if (sel.error) return sel;
      const h = Number.isInteger(args?.horizonteDias) ? clamp(args.horizonteDias, 1, 30) : 7;
      return {
        horizonteDias: h, metodo: 'extrapolacion_lineal_demostrativa',
        sensores: sel.sensores.map(s => {
          const tendenciaPct = ((s.caudal - s.base) / Math.max(s.base, 0.5)) * 100;
          const proy = Math.max(0, s.caudal + (s.caudal - s.base) * (h / 30));
          return { sensorId: s.id, caudalActualLMin: s.caudal, proyeccionLMin: r1(proy), tendenciaPct: r1(tendenciaPct), riesgo: tendenciaPct >= 60 ? 'alto' : tendenciaPct >= 25 ? 'medio' : 'bajo' };
        }),
      };
    },
  },
  proponerAccion: {
    descripcion: 'Crea una PROPUESTA de acción en estado pendiente. No ejecuta nada: requiere aprobación humana. Cierre de válvula y aviso a la EPS exigen fuga confirmada.',
    parametros: {
      type: 'object',
      properties: {
        sensorId: { type: 'string' },
        tipo: { type: 'string', enum: Object.keys(TIPOS_ACCION) },
        prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        detalle: { type: 'string', description: 'Justificación breve (máx. 200 caracteres).' },
      },
      required: ['sensorId', 'tipo', 'prioridad'],
      additionalProperties: false,
    },
    ejecutar(args, ctx) {
      if (ctx.restringido) return { error: 'bloqueado: la solicitud fue marcada como sospechosa; no se crean propuestas.' };
      const s = ctx.sensores.find(x => x.id === args?.sensorId);
      if (!s) return { error: `El sensor "${limpiar(args?.sensorId, 40)}" no existe.` };
      if (!TIPOS_ACCION[args?.tipo]) return { error: `Tipo inválido. Usa: ${Object.keys(TIPOS_ACCION).join(', ')}.` };
      if (!['alta', 'media', 'baja'].includes(args?.prioridad)) return { error: 'Prioridad inválida (alta|media|baja).' };
      const e = evaluarSensor(s);
      if ((args.tipo === 'cerrar_valvula' || args.tipo === 'notificar_eps') && !e.fugaConfirmada) {
        return { error: `No hay fuga confirmada en "${s.id}" (riesgo ${e.riesgoPct}% < umbral ${e.umbralPct}%). No se propone ${args.tipo}.` };
      }
      if (args.tipo === 'mantenimiento' && e.riesgoPct < 30) {
        return { error: `Riesgo ${e.riesgoPct}% demasiado bajo para proponer mantenimiento.` };
      }
      const { accion, duplicada } = ctx.acciones.crear({
        sensorId: s.id, sensorNombre: s.nombre, tipo: args.tipo, prioridad: args.prioridad,
        detalle: limpiar(args.detalle, 200) || `${TIPOS_ACCION[args.tipo]} en "${s.nombre}" (riesgo ${e.riesgoPct}%).`,
        trazaId: ctx.traza?.id,
      });
      // Se informan también las propuestas que ya estaban pendientes: son las vigentes para esta consulta.
      if (!ctx.accionesCreadas.some(a => a.id === accion.id)) ctx.accionesCreadas.push(accion);
      return { ok: true, estado: accion.estado, duplicada, accionId: accion.id, mensaje: 'Propuesta registrada como PENDIENTE de aprobación humana.' };
    },
  },
  registrarDecision: {
    descripcion: 'Registra un evento en el historial de decisiones (auditoría). No modifica el estado de ningún sensor.',
    parametros: {
      type: 'object',
      properties: { sensorId: { type: 'string' }, evento: { type: 'string' }, resultado: { type: 'string' } },
      required: ['evento'],
      additionalProperties: false,
    },
    ejecutar(args, ctx) {
      const s = args?.sensorId ? ctx.sensores.find(x => x.id === args.sensorId) : null;
      const d = ctx.decisiones.registrar({
        sensorNombre: s?.nombre || 'Sistema', evento: limpiar(args?.evento, 120) || 'Evento',
        decididoPor: 'Automático (Agente Ejecutor)', resultado: limpiar(args?.resultado, 120) || 'Registrado',
        trazaId: ctx.traza?.id,
      });
      return { ok: true, id: d.id };
    },
  },
};

export function esquemaOpenAI(nombre) {
  const h = HERRAMIENTAS[nombre];
  return { type: 'function', function: { name: nombre, description: h.descripcion, parameters: h.parametros } };
}
