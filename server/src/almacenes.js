// Almacenes en memoria (acciones propuestas, historial de decisiones, trazas, memoria de conversación).
// Si STORAGE=sqlserver, trazas y decisiones se replican (best-effort) en SQL Server vía persistencia.js.
import { randomUUID } from 'node:crypto';
import { TIPOS_ACCION } from './agents/herramientas.js';

export function crearAlmacenAcciones({ max = 200, ahora = () => new Date() } = {}) {
  const lista = [];
  let seq = 0;
  return {
    crear({ sensorId, sensorNombre, tipo, prioridad, detalle, trazaId }) {
      const dup = lista.find(a => a.estado === 'pendiente' && a.sensorId === sensorId && a.tipo === tipo);
      if (dup) return { accion: dup, duplicada: true };
      const accion = {
        id: ++seq, sensorId, sensorNombre, tipo, tipoEtiqueta: TIPOS_ACCION[tipo] || tipo, prioridad, detalle,
        estado: 'pendiente', creadaPor: 'Agente Ejecutor', trazaId: trazaId || null,
        fecha: ahora().toISOString(), decididaPor: null, fechaDecision: null,
      };
      lista.unshift(accion);
      if (lista.length > max) lista.pop();
      return { accion, duplicada: false };
    },
    listar(estado) { return estado ? lista.filter(a => a.estado === estado) : [...lista]; },
    cancelarPendientes(por = 'Sistema') {
      let n = 0;
      for (const a of lista) if (a.estado === 'pendiente') { a.estado = 'descartada'; a.decididaPor = por; a.fechaDecision = ahora().toISOString(); n++; }
      return n;
    },
    obtener(id) { return lista.find(a => a.id === Number(id)) || null; },
    decidir(id, estado, por = 'Manual (usuario)') {
      const a = lista.find(x => x.id === Number(id));
      if (!a) return { error: 'no_existe' };
      if (a.estado !== 'pendiente') return { error: 'no_pendiente', accion: a };
      a.estado = estado; a.decididaPor = por; a.fechaDecision = ahora().toISOString();
      return { accion: a };
    },
  };
}

export function crearAlmacenDecisiones({ max = 500, persistir = null, ahora = () => new Date() } = {}) {
  const lista = [];
  let seq = 0;
  return {
    registrar({ sensorNombre, evento, decididoPor, resultado, trazaId }) {
      const d = { id: ++seq, fecha: ahora().toISOString(), sensorNombre, evento, decididoPor, resultado, trazaId: trazaId || null };
      lista.unshift(d);
      if (lista.length > max) lista.pop();
      persistir?.guardarDecision?.(d);
      return d;
    },
    listar(limit = 50) { return lista.slice(0, limit); },
  };
}

export function crearAlmacenTrazas({ max = 200, persistir = null } = {}) {
  const lista = [];
  return {
    guardar(traza) {
      lista.unshift(traza);
      if (lista.length > max) lista.pop();
      persistir?.guardarTraza?.(traza);
    },
    obtener(id) { return lista.find(t => t.id === id) || null; },
    listar(limit = 20, completo = false) {
      return lista.slice(0, limit).map(t => (completo ? t : { ...t, eventos: undefined, numEventos: t.eventos.length }));
    },
    total: () => lista.length,
  };
}

// Memoria de corto plazo por sesión (E5): últimos turnos usuario/asistente, con vencimiento.
export function crearMemoria({ maxSesiones = 200, maxTurnos = 6, ttlMs = 30 * 60 * 1000, ahora = () => Date.now() } = {}) {
  const sesiones = new Map();
  const limpiar = () => {
    const t = ahora();
    for (const [k, v] of sesiones) if (t - v.ts > ttlMs) sesiones.delete(k);
    while (sesiones.size > maxSesiones) sesiones.delete(sesiones.keys().next().value);
  };
  const claveValida = (s) => typeof s === 'string' && /^[\w-]{6,64}$/.test(s);
  return {
    turnos(sesionId) {
      if (!claveValida(sesionId)) return [];
      limpiar();
      return [...(sesiones.get(sesionId)?.turnos || [])];
    },
    agregar(sesionId, usuario, asistente) {
      if (!claveValida(sesionId)) return;
      limpiar();
      const s = sesiones.get(sesionId) || { turnos: [], ts: ahora() };
      s.turnos.push({ role: 'user', content: usuario.slice(0, 500) }, { role: 'assistant', content: asistente.slice(0, 800) });
      s.turnos = s.turnos.slice(-maxTurnos * 2);
      s.ts = ahora();
      sesiones.set(sesionId, s);
    },
    tamano: () => sesiones.size,
  };
}

export const nuevoId = () => randomUUID().slice(0, 8);
