// Construye el contexto de datos que ven las herramientas en cada solicitud.
// Fuente: snapshot enviado por la interfaz (validado) o, si no hay, el simulador del servidor.
const ID_RE = /^[\w-]{1,40}$/;
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max);

export function normalizarSensoresCliente(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  for (const s of lista.slice(0, 20)) {
    if (!s || typeof s !== 'object' || !ID_RE.test(String(s.id ?? ''))) continue;
    const caudal = num(s.caudal, 0, 1000), base = num(s.base, 0.01, 1000);
    const presion = num(s.presion, 0, 100), presionBase = num(s.presionBase, 0.01, 100);
    if (caudal === null || base === null || presion === null || presionBase === null) continue;
    out.push({
      id: String(s.id), nombre: texto(s.nombre, 60) || String(s.id), base, presionBase,
      umbral: num(s.umbral, 0, 100) ?? 70, caudal, presion, valvulaCerrada: !!s.valvulaCerrada,
    });
  }
  return out;
}

export function construirContexto({ contextoCliente, simulador, acciones, decisiones, traza, restringido }) {
  const delCliente = normalizarSensoresCliente(contextoCliente?.sensores);
  const sensores = delCliente.length ? delCliente : simulador.snapshot();
  return {
    fuente: delCliente.length ? 'snapshot_interfaz' : 'simulador_servidor',
    sensores,
    simulador,
    acciones,
    decisiones,
    traza,
    restringido: !!restringido,
    accionesCreadas: [],
    fugasConfirmadas: new Set(),
  };
}
