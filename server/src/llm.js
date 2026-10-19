// Cliente del LLM. Modo 'groq': API compatible con OpenAI (function calling), con timeout,
// reintentos con retroceso y tope diario de llamadas. Modo 'mock': respuestas deterministas locales.
import { LimiteError, LlmError } from './errores.js';
import { mockChat } from './agents/mock.js';

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const hoyUTC = () => new Date().toISOString().slice(0, 10);

export function crearLLM(cfg, { fetchImpl = globalThis.fetch, pausa = dormir } = {}) {
  let dia = hoyUTC();
  let llamadasHoy = 0;

  async function chat({ agente, model, messages, tools }) {
    if (dia !== hoyUTC()) { dia = hoyUTC(); llamadasHoy = 0; }
    if (llamadasHoy >= cfg.topeDiarioLlm) {
      throw new LimiteError('tope_diario_llm', `Se alcanzó el tope diario de ${cfg.topeDiarioLlm} llamadas al modelo.`);
    }
    llamadasHoy++;

    if (cfg.llmMode === 'mock') return mockChat({ agente, model, messages, tools });
    if (!cfg.groqKey) throw new LlmError('GROQ_API_KEY no está configurada en el servidor.', 500);

    const body = {
      model, messages, temperature: 0.2, max_completion_tokens: cfg.llmMaxTokens,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
      ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
    };

    let ultimoError;
    for (let intento = 0; intento <= cfg.llmReintentos; intento++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.llmTimeoutMs);
      try {
        const res = await fetchImpl(cfg.groqUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.groqKey}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          const espera = Math.min(3000, Number(res.headers?.get?.('retry-after')) * 1000 || 500 * 2 ** intento);
          ultimoError = new LlmError(`El modelo respondió ${res.status}.`, res.status);
          if (intento < cfg.llmReintentos) { await pausa(espera); continue; }
          throw ultimoError;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new LlmError(data?.error?.message || `Error ${res.status} del modelo.`, res.status);
        const message = data?.choices?.[0]?.message;
        if (!message) throw new LlmError('Respuesta del modelo sin "message".', 502);
        return { message, usage: data.usage || {}, model: data.model || model };
      } catch (e) {
        if (e instanceof LlmError && e.status && e.status < 500 && e.status !== 429) throw e; // 4xx: no reintentar
        ultimoError = e.name === 'AbortError' ? new LlmError(`Timeout del modelo (${cfg.llmTimeoutMs} ms).`, 504) : e;
        if (intento < cfg.llmReintentos) { await pausa(500 * 2 ** intento); continue; }
        throw ultimoError instanceof LlmError ? ultimoError : new LlmError(ultimoError.message || 'Fallo de red hacia el modelo.', 502);
      } finally { clearTimeout(timer); }
    }
    throw ultimoError;
  }

  return {
    chat,
    estado: () => ({ modo: cfg.llmMode, llamadasHoy, topeDiario: cfg.topeDiarioLlm }),
  };
}
