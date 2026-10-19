import { cargarConfig } from '../src/config.js';
import { crearDeps } from '../src/deps.js';
import { crearSimulador } from '../src/simulador.js';

// rng determinista para que las pruebas sean repetibles
export function rngFijo(valor = 0.5) { return () => valor; }

export function depsDePrueba({ env = {}, llm = null, extra = {} } = {}) {
  const cfg = cargarConfig({ LLM_MODE: 'mock', ...env });
  const deps = crearDeps(cfg, { simulador: crearSimulador({ rng: rngFijo(0.5) }), ...extra });
  if (llm) deps.llm = llm;
  return deps;
}

// LLM guionado: recibe una función (agente, messages, n) -> message
export function llmGuionado(fn) {
  let n = 0; const llamadas = [];
  return {
    llamadas,
    estado: () => ({ modo: 'mock', llamadasHoy: n, topeDiario: 999 }),
    async chat({ agente, messages }) {
      n++; llamadas.push(agente);
      const message = await fn(agente, messages, n);
      return { message, usage: { prompt_tokens: 10, completion_tokens: 5 }, model: 'guion' };
    },
  };
}
export const tc = (name, args, id = 'c' + Math.random().toString(36).slice(2, 7)) => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
