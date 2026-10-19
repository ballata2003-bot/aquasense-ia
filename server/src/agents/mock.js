// LLM SIMULADO y determinista. Sirve para pruebas automáticas y para demostrar el flujo sin clave.
// NO es un modelo de lenguaje: aplica reglas de palabras clave. El estado /health lo declara como "mock".
let contador = 0;
const idLlamada = () => `call_mock_${++contador}`;
const estimar = (t) => Math.ceil(String(t).length / 4);

function usoEstimado(messages, salida) {
  const entrada = messages.reduce((a, m) => a + estimar(m.content || '') + estimar(JSON.stringify(m.tool_calls || '')), 0);
  return { prompt_tokens: entrada, completion_tokens: estimar(salida), total_tokens: entrada + estimar(salida) };
}
const llamada = (name, args) => ({ id: idLlamada(), type: 'function', function: { name, arguments: JSON.stringify(args) } });
const resp = (messages, message) => ({
  message, usage: usoEstimado(messages, message.content || JSON.stringify(message.tool_calls || '')), model: 'mock',
});
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

function textoUsuario(messages) {
  const ult = [...messages].reverse().find(m => m.role === 'user');
  const c = ult?.content || '';
  const m = c.match(/<<<MENSAJE_USUARIO>>>\n?([\s\S]*?)\n?<<<FIN_MENSAJE_USUARIO>>>/);
  return (m ? m[1] : c).toLowerCase();
}
const resultadosTool = (messages) => messages.filter(m => m.role === 'tool').map(m => parse(m.content)).filter(Boolean);

function coordinador(messages) {
  const texto = textoUsuario(messages);
  const res = resultadosTool(messages);
  const hechos = new Set(res.map(r => r.claveAgente).filter(Boolean));
  const dominio = /fuga|sensor|presi[oó]n|caudal|consumo|v[aá]lvula|alerta|agua|acci[oó]n|predic|proyec|riesgo|anomal|estado|medidor|cocina|ba[nñ]o|jard[ií]n|agente|ahorro|tendencia/.test(texto);
  if (!dominio) {
    return resp(messages, { role: 'assistant', content: 'Solo puedo ayudarte con el monitoreo y consumo de agua de AquaSense IA (sensores, fugas, acciones y proyecciones).' });
  }
  const quiereDeteccion = /fuga|anomal|alerta|riesgo|estado|v[aá]lvula|cerrar|acci[oó]n|sensor|c[oó]mo (est[aá]n|va)/.test(texto);
  const quierePredictivo = /predic|proyec|tendencia|d[ií]as|futuro/.test(texto);
  const quiereAccion = /cerrar|v[aá]lvula|acci[oó]n|corregir|proponer|actuar/.test(texto);

  if (!hechos.has('sensor')) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('delegar_a_agente', { agente: 'sensor', tarea: 'Consulta las lecturas actuales de todos los sensores.' })] });
  if (quiereDeteccion && !hechos.has('deteccion')) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('delegar_a_agente', { agente: 'deteccion', tarea: 'Calcula el riesgo de fuga de todos los sensores e indica cuáles se confirman.' })] });
  if (quierePredictivo && !hechos.has('predictivo')) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('delegar_a_agente', { agente: 'predictivo', tarea: 'Proyecta el consumo a 7 días y señala el sensor de mayor riesgo.' })] });

  const det = res.find(r => r.claveAgente === 'deteccion');
  const fugas = det?.datos?.fugas || [];
  const ejecutorBloqueado = res.some(r => r.error);
  if (fugas.length && !hechos.has('ejecutor') && !ejecutorBloqueado) {
    return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('delegar_a_agente', {
      agente: 'ejecutor', tarea: `Propón acciones (cerrar_valvula alta y notificar_eps media) para: ${fugas.slice(0, 2).map(f => `sensorId=${f}`).join(', ')}.`,
    })] });
  }
  // Respuesta final redactada con lo que informaron los agentes
  const partes = res.filter(r => r.resumen).map(r => r.resumen);
  const ej = res.find(r => r.claveAgente === 'ejecutor');
  let final = partes.join(' ') || 'No se obtuvieron datos suficientes.';
  if (ej?.datos?.propuestas?.length && !/PENDIENTES/.test(final)) final += ' Las acciones propuestas quedan PENDIENTES de aprobación humana.';
  else if (ejecutorBloqueado) final += ' No se propusieron acciones.';
  else if (quiereAccion && !fugas.length) final += ' No hay fuga confirmada, por lo que no se propone ninguna acción.';
  return resp(messages, { role: 'assistant', content: final.slice(0, 700) });
}

function especialista(clave, messages) {
  const res = resultadosTool(messages);
  const tarea = messages.find(m => m.role === 'user')?.content || '';
  const json = (o) => resp(messages, { role: 'assistant', content: JSON.stringify(o) });

  if (clave === 'sensor') {
    if (!res.length) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('consultarLecturas', {})] });
    const l = res[0].sensores || [];
    return json({
      resumen: `Se leyeron ${l.length} sensores: ` + l.map(s => `${s.nombre} ${s.caudalLMin} L/min`).join('; ') + '.',
      hallazgos: l.map(s => `${s.sensorId}: ${s.caudalLMin} L/min (base ${s.consumoBaseLMin}), ${s.presionBar} bar`), datos: { sensores: l },
    });
  }
  if (clave === 'deteccion') {
    if (!res.length) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('calcularRiesgoFuga', {})] });
    const r = res[0]; const f = r.fugas || [];
    return json({
      resumen: f.length ? `Fuga confirmada en: ${f.join(', ')}.` : 'No se confirma ninguna fuga; todos los sensores están bajo su umbral.',
      hallazgos: (r.sensores || []).map(s => `${s.sensorId}: riesgo ${s.riesgoPct}% (umbral ${s.umbralPct}%)`), datos: { fugas: f, sensores: r.sensores },
    });
  }
  if (clave === 'predictivo') {
    if (!res.length) return resp(messages, { role: 'assistant', content: null, tool_calls: [llamada('proyectarConsumo', { horizonteDias: 7 })] });
    const s = res[0].sensores || [];
    const top = [...s].sort((a, b) => b.tendenciaPct - a.tendenciaPct)[0];
    return json({ resumen: top ? `Mayor riesgo proyectado: ${top.sensorId} (${top.tendenciaPct}% sobre su base; extrapolación lineal demostrativa).` : 'Sin datos para proyectar.', hallazgos: s.map(x => `${x.sensorId}: ${x.proyeccionLMin} L/min a ${res[0].horizonteDias} días`), datos: { sensores: s } });
  }
  if (clave === 'ejecutor') {
    if (!res.length) {
      const ids = [...tarea.matchAll(/sensorId=([\w-]+)/g)].map(m => m[1]).slice(0, 2);
      if (!ids.length) return json({ resumen: 'No recibí un sensorId con fuga confirmada; no propongo acciones.', hallazgos: [], datos: { propuestas: [] } });
      const calls = ids.flatMap(id => [
        llamada('proponerAccion', { sensorId: id, tipo: 'cerrar_valvula', prioridad: 'alta', detalle: `Cerrar el paso de agua en ${id} mientras se confirma la fuga.` }),
        llamada('proponerAccion', { sensorId: id, tipo: 'notificar_eps', prioridad: 'media', detalle: `Reportar la anomalía en ${id} a la EPS.` }),
      ]);
      return resp(messages, { role: 'assistant', content: null, tool_calls: calls });
    }
    const ok = res.filter(r => r.ok); const err = res.filter(r => r.error);
    return json({
      resumen: ok.length ? `Se registraron ${ok.length} propuesta(s) PENDIENTES de aprobación humana.` : 'No se pudo registrar ninguna propuesta.',
      hallazgos: [...ok.map(r => `Acción #${r.accionId} ${r.estado}`), ...err.map(r => `Error: ${r.error}`)], datos: { propuestas: ok.map(r => r.accionId) },
    });
  }
  return json({ resumen: 'Sin acción.', hallazgos: [], datos: {} });
}

export function mockChat({ agente, messages }) {
  return Promise.resolve(agente === 'coordinador' ? coordinador(messages) : especialista(agente, messages));
}
