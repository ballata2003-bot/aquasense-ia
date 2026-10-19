import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';
import { depsDePrueba } from './helpers.js';

async function levantar(envExtra = {}) {
  const deps = depsDePrueba({ env: envExtra });
  const app = crearApp(deps);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (ruta, cuerpo) => fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return { deps, base, post, cerrar: () => new Promise(r => server.close(r)) };
}

test('A1 /health responde 200, declara modo mock y no expone secretos', async () => {
  const s = await levantar();
  try {
    const r = await fetch(s.base + '/health');
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.llm.modo, 'mock');
    assert.ok(j.llm.advertencia);
    assert.equal(j.db, 'no configurado');
    assert.ok(!/gsk_|password|secret/i.test(JSON.stringify(j)));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('x-powered-by'), null);
  } finally { await s.cerrar(); }
});

test('A2 flujo completo con aprobación humana: fuga → propuesta pendiente → aprobar → válvula cerrada', async () => {
  const s = await levantar();
  try {
    assert.equal((await s.post('/api/simulador/fuga', { sensorId: 'cocina' })).status, 200);
    const r = await s.post('/api/agentes/solicitud', { mensaje: '¿Hay alguna fuga activa ahora mismo?' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.agentes.length >= 3);
    const pend = await (await fetch(s.base + '/api/agentes/acciones?estado=pendiente')).json();
    assert.ok(pend.length >= 2);
    const cierre = pend.find(a => a.tipo === 'cerrar_valvula');
    // antes de aprobar, la válvula sigue abierta
    let est = await (await fetch(s.base + '/api/simulador/estado')).json();
    assert.equal(est.sensores.find(x => x.id === 'cocina').valvulaCerrada, false);
    const ap = await s.post(`/api/agentes/acciones/${cierre.id}/aprobar`, {});
    assert.equal(ap.status, 200);
    est = await (await fetch(s.base + '/api/simulador/estado')).json();
    assert.equal(est.sensores.find(x => x.id === 'cocina').valvulaCerrada, true);
    // segunda decisión sobre la misma acción → 409
    assert.equal((await s.post(`/api/agentes/acciones/${cierre.id}/descartar`, {})).status, 409);
    const hist = await (await fetch(s.base + '/api/agentes/historial')).json();
    assert.ok(hist.some(h => /aprobada/.test(h.resultado)));
    // la traza queda consultable
    const tr = await (await fetch(`${s.base}/api/agentes/trazas/${j.id}`)).json();
    assert.ok(tr.eventos.some(e => e.tipo === 'delegacion'));
  } finally { await s.cerrar(); }
});

test('A3 validaciones HTTP: mensaje vacío 400, JSON roto 400, decisión inválida 400, acción inexistente 404', async () => {
  const s = await levantar();
  try {
    assert.equal((await s.post('/api/agentes/solicitud', { mensaje: '' })).status, 400);
    const roto = await fetch(s.base + '/api/agentes/solicitud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{no-json' });
    assert.equal(roto.status, 400);
    assert.equal((await s.post('/api/agentes/acciones/1/borrar', {})).status, 400);
    assert.equal((await s.post('/api/agentes/acciones/999/aprobar', {})).status, 404);
    assert.equal((await s.post('/api/simulador/fuga', { sensorId: 'zzz' })).status, 400);
  } finally { await s.cerrar(); }
});

test('A4 límite de peticiones: la solicitud nº 4 recibe 429 con Retry-After', async () => {
  const s = await levantar({ RATE_LIMIT_POR_MIN: '3' });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await s.post('/api/agentes/solicitud', { mensaje: '¿Cómo están mis sensores?' })).status, 200);
    const r = await s.post('/api/agentes/solicitud', { mensaje: '¿Cómo están mis sensores?' });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get('retry-after'));
  } finally { await s.cerrar(); }
});

test('A5 sin SQL configurado, las rutas de persistencia responden 503 y las desconocidas 404', async () => {
  const s = await levantar();
  try {
    assert.equal((await fetch(s.base + '/api/sensores')).status, 503);
    assert.equal((await fetch(s.base + '/api/inexistente')).status, 404);
  } finally { await s.cerrar(); }
});

test('A6 /api/agentes/info describe agentes, herramientas y límites', async () => {
  const s = await levantar();
  try {
    const j = await (await fetch(s.base + '/api/agentes/info')).json();
    assert.equal(j.agentes.length, 5);
    assert.ok(j.agentes.find(a => a.clave === 'ejecutor').herramientas.includes('proponerAccion'));
    assert.ok(j.limites.maxDelegaciones > 0);
  } finally { await s.cerrar(); }
});

test('A7 el simulador puede deshabilitarse (ENABLE_SIMULADOR=false)', async () => {
  const s = await levantar({ ENABLE_SIMULADOR: 'false' });
  try { assert.equal((await fetch(s.base + '/api/simulador/estado')).status, 404); } finally { await s.cerrar(); }
});
