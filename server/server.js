// AquaSense IA v2 — API del sistema multiagente + interfaz web (sirve ../public).
// Ejecuta:  npm install   y luego   npm start      (http://localhost:3001)
import { cargarConfig } from './src/config.js';
import { crearDeps } from './src/deps.js';
import { crearApp } from './src/app.js';

const cfg = cargarConfig();
const deps = crearDeps(cfg);

if (cfg.storage === 'sqlserver') {
  const { default: routerSql } = await import('./routes-sql.js');
  deps.montarSql = (app) => app.use('/api', routerSql);
}

const app = crearApp(deps);
app.listen(cfg.port, () => {
  console.log(`AquaSense IA escuchando en http://localhost:${cfg.port}`);
  console.log(`  Salud:  http://localhost:${cfg.port}/health`);
  console.log(`  LLM: modo=${cfg.llmMode} · coordinador=${cfg.modeloCoordinador} · especialistas=${cfg.modeloEspecialista}`);
  console.log(`  Almacenamiento: ${cfg.storage}`);
  if (cfg.llmMode === 'mock') console.warn('  ⚠ LLM_MODE=mock: respuestas SIMULADAS. Define GROQ_API_KEY para usar un modelo real.');
  if (cfg.llmMode === 'groq' && !cfg.groqKey) console.warn('  ⚠ Falta GROQ_API_KEY: las solicitudes a los agentes fallarán.');
});
