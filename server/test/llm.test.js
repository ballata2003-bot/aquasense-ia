import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarConfig } from '../src/config.js';
import { crearLLM } from '../src/llm.js';
import { LimiteError, LlmError } from '../src/errores.js';

const cfgGroq = (env = {}) => cargarConfig({ LLM_MODE: 'groq', GROQ_API_KEY: 'clave-de-prueba', LLM_REINTENTOS: '2', ...env });
const ok = (message = { role: 'assistant', content: 'hola' }) => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ model: 'm', choices: [{ message }], usage: { prompt_tokens: 7, completion_tokens: 3 } }),
});
const err = (status, body = {}) => ({ ok: false, status, headers: { get: () => null }, json: async () => body });
const sinPausa = async () => {};

test('L1 la petición a Groq lleva modelo, herramientas, Authorization y max_completion_tokens', async () => {
  let visto;
  const llm = crearLLM(cfgGroq(), { fetchImpl: async (url, init) => { visto = { url, init, body: JSON.parse(init.body) }; return ok(); }, pausa: sinPausa });
  const tools = [{ type: 'function', function: { name: 'x', parameters: { type: 'object' } } }];
  const r = await llm.chat({ agente: 'sensor', model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'hi' }], tools });
  assert.equal(visto.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(visto.init.headers.Authorization, 'Bearer clave-de-prueba');
  assert.equal(visto.body.model, 'openai/gpt-oss-20b');
  assert.equal(visto.body.tool_choice, 'auto');
  assert.equal(visto.body.max_completion_tokens, 1500);
  assert.equal(visto.body.reasoning_effort, 'low');
  assert.deepEqual(r.usage, { prompt_tokens: 7, completion_tokens: 3 });
});

test('L2 reintenta ante 429 y 503 y finalmente responde', async () => {
  const seq = [err(429), err(503), ok()]; let n = 0;
  const llm = crearLLM(cfgGroq(), { fetchImpl: async () => seq[n++], pausa: sinPausa });
  const r = await llm.chat({ agente: 'sensor', model: 'm', messages: [] });
  assert.equal(n, 3);
  assert.equal(r.message.content, 'hola');
});

test('L3 agota los reintentos y lanza LlmError', async () => {
  let n = 0;
  const llm = crearLLM(cfgGroq({ LLM_REINTENTOS: '1' }), { fetchImpl: async () => { n++; return err(503); }, pausa: sinPausa });
  await assert.rejects(() => llm.chat({ agente: 'sensor', model: 'm', messages: [] }), LlmError);
  assert.equal(n, 2);
});

test('L4 un 400 NO se reintenta y conserva el mensaje del proveedor', async () => {
  let n = 0;
  const llm = crearLLM(cfgGroq(), { fetchImpl: async () => { n++; return err(400, { error: { message: 'modelo inválido' } }); }, pausa: sinPausa });
  await assert.rejects(() => llm.chat({ agente: 'sensor', model: 'm', messages: [] }), /modelo inválido/);
  assert.equal(n, 1);
});

test('L5 timeout: aborta la petición colgada y lanza LlmError', async () => {
  const llm = crearLLM(cfgGroq({ LLM_TIMEOUT_MS: '30', LLM_REINTENTOS: '0' }), {
    fetchImpl: (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))),
    pausa: sinPausa,
  });
  await assert.rejects(() => llm.chat({ agente: 'sensor', model: 'm', messages: [] }), /Timeout/);
});

test('L6 tope diario: lanza LimiteError al superarlo', async () => {
  const llm = crearLLM(cfgGroq({ TOPE_DIARIO_LLM: '2' }), { fetchImpl: async () => ok(), pausa: sinPausa });
  await llm.chat({ agente: 'a', model: 'm', messages: [] });
  await llm.chat({ agente: 'a', model: 'm', messages: [] });
  await assert.rejects(() => llm.chat({ agente: 'a', model: 'm', messages: [] }), LimiteError);
});

test('L7 sin GROQ_API_KEY en modo groq falla con mensaje claro (y no filtra nada)', async () => {
  const llm = crearLLM(cargarConfig({ LLM_MODE: 'groq' }), { fetchImpl: async () => ok(), pausa: sinPausa });
  await assert.rejects(() => llm.chat({ agente: 'a', model: 'm', messages: [] }), /GROQ_API_KEY/);
});

test('L8 los precios por defecto corresponden a los modelos configurados', () => {
  const c = cargarConfig({});
  assert.deepEqual(c.precios['openai/gpt-oss-120b'], { in: 0.15, out: 0.60 });
  assert.deepEqual(c.precios['openai/gpt-oss-20b'], { in: 0.075, out: 0.30 });
});
