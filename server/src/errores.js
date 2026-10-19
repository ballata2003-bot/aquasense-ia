// Errores tipados para distinguir fallos esperados (validación, límites) de fallos inesperados.
export class ValidationError extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'ValidationError'; this.status = 400; }
}
export class LimiteError extends Error {
  constructor(codigo, mensaje) { super(mensaje || codigo); this.name = 'LimiteError'; this.codigo = codigo; }
}
export class LlmError extends Error {
  constructor(mensaje, status) { super(mensaje); this.name = 'LlmError'; this.status = status; }
}
