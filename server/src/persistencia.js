// Replica opcional en SQL Server (STORAGE=sqlserver). Los fallos NUNCA tumban una solicitud:
// se registran en consola y la aplicación sigue funcionando con los almacenes en memoria.
export function crearPersistencia(cfg) {
  if (cfg.storage !== 'sqlserver') return { activa: false, guardarTraza() {}, guardarDecision() {} };
  let dbPromise = null;
  const db = () => (dbPromise ||= import('./db.js'));
  return {
    activa: true,
    async guardarTraza(t) {
      try {
        const { getPool, sql } = await db();
        const pool = await getPool();
        await pool.request()
          .input('id', sql.NVarChar(40), t.id)
          .input('mensaje', sql.NVarChar(600), t.mensaje)
          .input('respuesta', sql.NVarChar(sql.MAX), t.respuesta)
          .input('agentes', sql.NVarChar(200), t.agentes.join(','))
          .input('ms', sql.Int, t.ms)
          .input('tokensIn', sql.Int, t.tokens.in)
          .input('tokensOut', sql.Int, t.tokens.out)
          .input('costo', sql.Decimal(10, 6), t.costoUsd)
          .input('abortado', sql.NVarChar(60), t.abortado)
          .input('json', sql.NVarChar(sql.MAX), JSON.stringify(t.eventos))
          .query(`INSERT INTO dbo.TrazasAgentes (Id, Mensaje, Respuesta, Agentes, Ms, TokensIn, TokensOut, CostoUsd, Abortado, EventosJson)
                  VALUES (@id, @mensaje, @respuesta, @agentes, @ms, @tokensIn, @tokensOut, @costo, @abortado, @json)`);
      } catch (e) { console.error('[persistencia] traza no guardada:', e.message); }
    },
    async guardarDecision(d) {
      try {
        const { getPool, sql } = await db();
        const pool = await getPool();
        await pool.request()
          .input('sensorNombre', sql.NVarChar(100), d.sensorNombre)
          .input('evento', sql.NVarChar(200), d.evento)
          .input('decididoPor', sql.NVarChar(100), d.decididoPor)
          .input('resultado', sql.NVarChar(200), d.resultado)
          .query(`INSERT INTO dbo.HistorialDecisiones (SensorNombre, Evento, DecididoPor, Resultado)
                  VALUES (@sensorNombre, @evento, @decididoPor, @resultado)`);
      } catch (e) { console.error('[persistencia] decisión no guardada:', e.message); }
    },
  };
}
