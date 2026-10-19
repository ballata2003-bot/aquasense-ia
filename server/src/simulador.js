// Simulador de sensores del lado del servidor. Permite usar y evaluar la API sin la interfaz
// (curl, scripts de medición, pruebas). Los datos son SIMULADOS; no hay sensores físicos.
const BASE = [
  { id: 'general', nombre: 'Medidor general', base: 6.2, presionBase: 3.1, umbral: 60 },
  { id: 'cocina',  nombre: 'Cocina',          base: 1.1, presionBase: 2.4, umbral: 75 },
  { id: 'bano',    nombre: 'Baño principal',  base: 0.8, presionBase: 2.2, umbral: 65 },
  { id: 'jardin',  nombre: 'Riego de jardín', base: 2.4, presionBase: 2.8, umbral: 80 },
];

export function crearSimulador({ rng = Math.random, sensores = BASE } = {}) {
  const estado = new Map();
  const reset = () => {
    estado.clear();
    sensores.forEach(s => estado.set(s.id, { ...s, fuga: false, valvulaCerrada: false }));
  };
  reset();
  const ruido = (amp) => (rng() - 0.5) * amp;

  return {
    reset,
    existe: (id) => estado.has(id),
    ids: () => [...estado.keys()],
    // Lo que "ven" los agentes: nunca incluye la bandera interna `fuga` (verdad oculta del simulador).
    snapshot() {
      return [...estado.values()].map(s => {
        const exceso = s.fuga && !s.valvulaCerrada ? 4 + rng() * 2 : 0;
        const caudal = s.valvulaCerrada ? 0 : Math.max(0, s.base + ruido(0.3) + exceso);
        const presion = Math.max(0.5, s.presionBase + exceso * 0.18 + ruido(0.15));
        return {
          id: s.id, nombre: s.nombre, base: s.base, presionBase: s.presionBase, umbral: s.umbral,
          caudal: +caudal.toFixed(2), presion: +presion.toFixed(2), valvulaCerrada: s.valvulaCerrada,
        };
      });
    },
    provocarFuga(id) { const s = estado.get(id); if (!s) return false; s.fuga = true; return true; },
    cerrarValvula(id) { const s = estado.get(id); if (!s) return false; s.valvulaCerrada = true; return true; },
    abrirValvula(id) { const s = estado.get(id); if (!s) return false; s.valvulaCerrada = false; s.fuga = false; return true; },
    estadoPublico() {
      return [...estado.values()].map(s => ({ id: s.id, nombre: s.nombre, valvulaCerrada: s.valvulaCerrada }));
    },
  };
}
