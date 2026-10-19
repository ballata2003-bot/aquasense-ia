// Utilidades de seguridad: sanitización de entrada, detección heurística de prompt injection,
// límite de peticiones y cabeceras HTTP.
import { ValidationError } from './errores.js';

export function sanitizarMensaje(valor, maxChars = 500) {
  if (typeof valor !== 'string') throw new ValidationError('El campo "mensaje" debe ser texto.');
  // quita caracteres de control (salvo salto de línea y tab), normaliza espacios
  const limpio = valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!limpio) throw new ValidationError('El mensaje está vacío.');
  if (limpio.length > maxChars) throw new ValidationError(`El mensaje supera ${maxChars} caracteres.`);
  return limpio;
}

const PATRONES_INYECCION = [
  ['ignorar_instrucciones', /\b(ignora|olvida|descarta|omite)\b.{0,40}\b(instrucciones|reglas|indicaciones|prompt)\b/i],
  ['ignore_instructions', /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions|rules|prompt|guidelines)\b/i],
  ['prompt_sistema', /\b(system|developer)\s*(prompt|message)\b|\bprompt\s+del\s+sistema\b|\bmensaje\s+del\s+sistema\b/i],
  ['cambio_de_rol', /\b(ahora\s+eres|act[uú]a\s+como|you\s+are\s+now|pretend\s+to\s+be|finge\s+ser)\b/i],
  ['exfiltracion_secretos', /\b(api[\s_-]?key|clave\s+de\s+api|contrase[nñ]a|password|token|secreto)\b/i],
  ['revelar_instrucciones', /\b(revela|muestra|imprime|repite|reveal|show|print)\b.{0,30}\b(instrucciones|prompt|reglas|instructions)\b/i],
  ['jailbreak', /\bjailbreak\b|\bDAN\b|modo\s+desarrollador|developer\s+mode/i],
  ['etiquetas_rol', /<\s*\/?\s*(system|assistant|script)\b|\[\s*(system|inst)\s*\]/i],
  ['accion_masiva', /\b(todas|todos)\b.{0,20}\b(v[aá]lvulas|sensores)\b.{0,30}\b(cierra|cerrar|apaga|elimina|borra)\b|\b(cierra|cerrar|apaga|elimina|borra)\b.{0,20}\b(todas|todos)\b/i],
];

// Devuelve la lista de patrones detectados (vacía si nada sospechoso).
export function detectarInyeccion(texto) {
  return PATRONES_INYECCION.filter(([, re]) => re.test(texto)).map(([nombre]) => nombre);
}

// Limitador de ventana deslizante en memoria (por IP). Suficiente para una instancia de demo.
export function crearLimitador({ max, ventanaMs = 60000, ahora = () => Date.now() }) {
  const hits = new Map();
  return function limitador(req, res, next) {
    const clave = req.ip || 'desconocido';
    const t = ahora();
    const lista = (hits.get(clave) || []).filter(x => t - x < ventanaMs);
    if (lista.length >= max) {
      const reintentarEn = Math.ceil((ventanaMs - (t - lista[0])) / 1000);
      res.set('Retry-After', String(reintentarEn));
      return res.status(429).json({ error: `Demasiadas peticiones. Intenta de nuevo en ${reintentarEn}s.` });
    }
    lista.push(t);
    hits.set(clave, lista);
    if (hits.size > 5000) { // evita crecimiento sin límite
      for (const [k, v] of hits) if (!v.some(x => t - x < ventanaMs)) hits.delete(k);
    }
    next();
  };
}

export function cabecerasSeguridad(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    // La interfaz usa <script> y <style> en línea; todo lo demás queda restringido al mismo origen.
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
}
