// Ensambla las dependencias reales de producción.
import { cargarConfig } from './config.js';
import { crearLLM } from './llm.js';
import { crearSimulador } from './simulador.js';
import { crearAlmacenAcciones, crearAlmacenDecisiones, crearAlmacenTrazas, crearMemoria } from './almacenes.js';
import { crearPersistencia } from './persistencia.js';

export function crearDeps(cfg = cargarConfig(), extra = {}) {
  const persistir = crearPersistencia(cfg);
  return {
    cfg,
    llm: crearLLM(cfg),
    simulador: crearSimulador(),
    acciones: crearAlmacenAcciones(),
    decisiones: crearAlmacenDecisiones({ persistir }),
    trazas: crearAlmacenTrazas({ persistir }),
    memoria: crearMemoria(),
    ...extra,
  };
}
