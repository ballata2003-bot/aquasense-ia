// Toda la configuración sale de variables de entorno (nunca del código).
// Ver .env.example para la lista completa y su significado.
import 'dotenv/config';

const num = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function cargarConfig(env = process.env) {
  const groqKey = env.GROQ_API_KEY || '';
  const llmMode = String(env.LLM_MODE || (groqKey ? 'groq' : 'mock')).toLowerCase();
  const modeloCoordinador = env.MODEL_COORDINADOR || 'openai/gpt-oss-120b';
  const modeloEspecialista = env.MODEL_ESPECIALISTA || 'openai/gpt-oss-20b';
  return {
    port: num(env.PORT, 3001),
    llmMode,                       // 'groq' (real) | 'mock' (simulado, solo para pruebas/demo sin clave)
    groqKey,
    groqUrl: env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions',
    modeloCoordinador,
    modeloEspecialista,
    reasoningEffort: env.LLM_REASONING_EFFORT ?? 'low', // '' = no enviar
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 20000),
    llmMaxTokens: num(env.LLM_MAX_TOKENS, 1500),
    llmReintentos: num(env.LLM_REINTENTOS, 2),
    // --- Límites anti-bucle / anti-descontrol (E7) ---
    maxPasosCoordinador: num(env.MAX_PASOS_COORDINADOR, 6),
    maxPasosEspecialista: num(env.MAX_PASOS_ESPECIALISTA, 4),
    maxLlamadasLlm: num(env.MAX_LLAMADAS_LLM, 14),
    maxDelegaciones: num(env.MAX_DELEGACIONES, 5),
    timeoutSolicitudMs: num(env.TIMEOUT_SOLICITUD_MS, 45000),
    timeoutHerramientaMs: num(env.TIMEOUT_HERRAMIENTA_MS, 3000),
    // --- Entrada y consumo (F4) ---
    maxMensajeChars: num(env.MAX_MENSAJE_CHARS, 500),
    rateLimitPorMin: num(env.RATE_LIMIT_POR_MIN, 20),
    rateLimitGeneralPorMin: num(env.RATE_LIMIT_GENERAL_POR_MIN, 120),
    topeDiarioLlm: num(env.TOPE_DIARIO_LLM, 500), // llamadas al LLM por día (tope duro)
    // Precios USD por 1M de tokens. VERIFICAR en https://groq.com/pricing antes de reportar.
    precios: {
      [modeloCoordinador]: { in: num(env.PRECIO_COORD_IN_USD_M, 0.15), out: num(env.PRECIO_COORD_OUT_USD_M, 0.60) },
      [modeloEspecialista]: { in: num(env.PRECIO_ESP_IN_USD_M, 0.075), out: num(env.PRECIO_ESP_OUT_USD_M, 0.30) },
    },
    storage: String(env.STORAGE || 'memory').toLowerCase(), // 'memory' | 'sqlserver'
    allowedOrigins: String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    habilitarSimulador: String(env.ENABLE_SIMULADOR || 'true').toLowerCase() !== 'false',
  };
}
