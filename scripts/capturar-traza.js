#!/usr/bin/env node
// Captura una traza real (E9) del sistema desplegado: entrada, delegaciones, herramientas, mensajes entre agentes y respuesta.
// Uso:  node scripts/capturar-traza.js https://tu-url.onrender.com
// Genera docs/evidencias/traza-<fecha>.json y .md  (adjunta el .md y el enlace a la URL en el cuestionario).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv.find(a => /^https?:\/\//.test(a)) || 'http://localhost:3001').replace(/\/$/, '');
const j = async (ruta, cuerpo) => { const r = await fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

const salud = await j('/health');
await j('/api/simulador/reset', {});
await j('/api/simulador/fuga', { sensorId: 'cocina' });
const { status, json: t } = await j('/api/agentes/solicitud', { mensaje: '¿Hay alguna fuga activa ahora mismo?' });
if (status !== 200) { console.error('Falló la solicitud:', status, t); process.exit(1); }

const fmt = (e) => {
  switch (e.tipo) {
    case 'entrada': return `**Entrada del usuario:** ${e.mensaje}`;
    case 'llm': return `LLM · ${e.agente} · \`${e.modelo}\` · ${e.ms} ms · ${e.tokens.in}→${e.tokens.out} tokens${e.herramientas_solicitadas?.length ? ` · solicita: ${e.herramientas_solicitadas.join(', ')}` : ''}`;
    case 'delegacion': return `**Delegación** ${e.de} → ${e.a}: ${e.tarea}`;
    case 'herramienta': return `**Herramienta** ${e.agente}.\`${e.herramienta}\`(${e.args}) → ${e.resultado}`;
    case 'mensaje_agente': return `**Mensaje** ${e.de} → ${e.a}: ${e.contenido}`;
    case 'bloqueo': case 'limite': case 'sospecha_inyeccion': return `⛔ ${e.tipo}: ${JSON.stringify(e)}`;
    case 'respuesta_final': return `**Respuesta final:** ${e.contenido}`;
    default: return `${e.tipo}: ${JSON.stringify(e)}`;
  }
};
const md = [
  `# Traza de ejecución ${t.id}`, '',
  `- URL: ${base}`, `- Fecha: ${t.fecha}`, `- Modo LLM: **${t.modo}** (${salud.json?.llm?.modeloCoordinador} / ${salud.json?.llm?.modeloEspecialista})`,
  `- Agentes: ${t.agentes.join(' → ')}`, `- Llamadas al modelo: ${t.llamadasLlm} · Tokens: ${t.tokens.in} in / ${t.tokens.out} out · Costo: US$ ${t.costoUsd} · Tiempo: ${t.ms} ms`,
  `- Acciones propuestas (pendientes de aprobación humana): ${t.accionesPropuestas.map(a => `#${a.id} ${a.tipoEtiqueta} (${a.sensorNombre})`).join('; ') || 'ninguna'}`,
  t.modo === 'mock' ? '\n> ⚠ Esta traza proviene de un servidor en modo SIMULADO. No sirve como evidencia del LLM real.\n' : '',
  '## Eventos', '', ...t.eventos.map(e => `${e.n}. \`+${e.tMs} ms\` ${fmt(e)}`),
].join('\n');
const dir = path.resolve(aqui, '../docs/evidencias'); mkdirSync(dir, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(path.join(dir, `traza-${sello}.json`), JSON.stringify(t, null, 2));
writeFileSync(path.join(dir, `traza-${sello}.md`), md);
console.log(md); console.log(`\nGuardado en docs/evidencias/traza-${sello}.{json,md}`);
await j('/api/simulador/reset', {});
