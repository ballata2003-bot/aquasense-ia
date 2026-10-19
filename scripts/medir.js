#!/usr/bin/env node
// Mide el sistema DESPLEGADO: tasa de casos correctos, latencia, tokens, costo y errores (I1, I2, G7).
// Uso:  node scripts/medir.js https://tu-url.onrender.com [repeticiones=1] [--concurrencia=5]
// Requiere Node 18+ (fetch nativo). No usa dependencias ni claves. Escribe docs/evidencias/medicion-<fecha>.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const base = (args.find(a => /^https?:\/\//.test(a)) || 'http://localhost:3001').replace(/\/$/, '');
const reps = Number(args.find(a => /^\d+$/.test(a)) || 1);
const conc = Number((args.find(a => a.startsWith('--concurrencia=')) || '').split('=')[1] || 0);
const casos = JSON.parse(readFileSync(path.join(aqui, 'casos-prueba.json'), 'utf8'));

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function http(ruta, opts = {}, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(base + ruta, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 429) { await dormir((Number(res.headers.get('retry-after')) || 5) * 1000 + 250); continue; }
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }
  return { status: 429, json: { error: 'rate limit persistente' } };
}
const post = (ruta, cuerpo) => http(ruta, { method: 'POST', body: JSON.stringify(cuerpo || {}) });
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)] : null; };
const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function evaluar(caso, r) {
  const e = caso.espera, fallos = [];
  const ag = r.agentes || [];
  (e.incluyeAgentes || []).forEach(a => { if (!ag.includes(a)) fallos.push(`falta ${a}`); });
  (e.excluyeAgentes || []).forEach(a => { if (ag.includes(a)) fallos.push(`no debía intervenir ${a}`); });
  if (e.soloCoordinador && (ag.length !== 1 || r.delegaciones !== 0)) fallos.push('debía responder solo el Coordinador');
  const n = (r.accionesPropuestas || []).length;
  if (e.minAcciones !== undefined && n < e.minAcciones) fallos.push(`acciones ${n} < ${e.minAcciones}`);
  if (e.maxAcciones !== undefined && n > e.maxAcciones) fallos.push(`acciones ${n} > ${e.maxAcciones}`);
  if (e.accionesSensor && !(r.accionesPropuestas || []).every(a => a.sensorId === e.accionesSensor)) fallos.push(`acción sobre sensor distinto de ${e.accionesSensor}`);
  if (e.sospecha && !(r.sospechaInyeccion || []).length) fallos.push('no marcó sospecha de inyección');
  if (e.respuestaNoContiene && new RegExp(e.respuestaNoContiene, 'i').test(r.respuesta || '')) fallos.push('la respuesta contiene un patrón prohibido');
  if (r.abortado) fallos.push(`abortado: ${r.abortado}`);
  return fallos;
}

const salud = await http('/health');
console.log(`Sistema: ${base}  ·  /health → ${salud.status}  ·  LLM: ${salud.json?.llm?.modo}  (${salud.json?.llm?.modeloCoordinador} / ${salud.json?.llm?.modeloEspecialista})`);
if (salud.json?.llm?.modo === 'mock') console.log('⚠ El servidor está en modo SIMULADO: estos números NO sirven como métricas del LLM real.');

const filas = [];
for (let rep = 1; rep <= reps; rep++) {
  for (const caso of casos) {
    await post('/api/simulador/reset');
    if (caso.preparar?.fuga) await post('/api/simulador/fuga', { sensorId: caso.preparar.fuga });
    const t = Date.now();
    const { status, json } = await post('/api/agentes/solicitud', { mensaje: caso.mensaje });
    const ms = Date.now() - t;
    const fallos = status === 200 ? evaluar(caso, json) : [`HTTP ${status}: ${json.error || ''}`];
    filas.push({ rep, id: caso.id, descripcion: caso.descripcion, status, ms, agentes: json.agentes, acciones: (json.accionesPropuestas || []).length,
      tokens: json.tokens, costoUsd: json.costoUsd, llamadasLlm: json.llamadasLlm, trazaId: json.id, paso: fallos.length === 0, fallos });
    console.log(`${fallos.length ? '✗' : '✓'} ${caso.id} ${String(ms).padStart(6)} ms  ${(json.agentes || []).join(' → ')}${fallos.length ? '   ← ' + fallos.join('; ') : ''}`);
  }
}
await post('/api/simulador/reset');

let concurrencia = null;
if (conc > 0) {
  await post('/api/simulador/reset');
  const t = Date.now();
  const rs = await Promise.all(Array.from({ length: conc }, async () => { const s = Date.now(); const r = await post('/api/agentes/solicitud', { mensaje: '¿Cómo están mis sensores?' }); return { status: r.status, ms: Date.now() - s }; }));
  concurrencia = { usuariosSimultaneos: conc, exitosas: rs.filter(r => r.status === 200).length, limitadas429: rs.filter(r => r.status === 429).length, msTotal: Date.now() - t, msProm: Math.round(prom(rs.map(r => r.ms))), msP95: pct(rs.map(r => r.ms), 95) };
  console.log('Concurrencia:', concurrencia);
}

const ok = filas.filter(f => f.paso).length;
const lat = filas.filter(f => f.status === 200).map(f => f.ms);
const resumen = {
  fecha: new Date().toISOString(), url: base, llm: salud.json?.llm, casos: filas.length, correctos: ok,
  tasaCorrectosPct: +(100 * ok / filas.length).toFixed(1),
  tasaErrorHttpPct: +(100 * filas.filter(f => f.status !== 200).length / filas.length).toFixed(1),
  latenciaMsProm: Math.round(prom(lat)), latenciaMsP50: pct(lat, 50), latenciaMsP95: pct(lat, 95),
  tokensProm: { in: Math.round(prom(filas.map(f => f.tokens?.in || 0))), out: Math.round(prom(filas.map(f => f.tokens?.out || 0))) },
  costoUsdPor100Consultas: +(prom(filas.map(f => f.costoUsd || 0)) * 100).toFixed(4),
  concurrencia,
};
console.log('\nRESUMEN', JSON.stringify(resumen, null, 2));
const dir = path.resolve(aqui, '../docs/evidencias'); mkdirSync(dir, { recursive: true });
const archivo = path.join(dir, `medicion-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(archivo, JSON.stringify({ resumen, filas }, null, 2));
console.log('\nGuardado en', archivo);
process.exit(ok === filas.length ? 0 : 1);
