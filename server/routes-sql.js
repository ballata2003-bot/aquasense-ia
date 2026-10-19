// Rutas REST de persistencia en SQL Server (heredadas de la v1). Solo se montan si STORAGE=sqlserver.
// Todas las consultas usan parámetros (sin concatenar SQL). Los detalles de error se registran en el
// servidor y NO se devuelven al cliente.
import { Router } from 'express';
import { getPool, sql } from './db.js';

const router = Router();

function handleDbError(res, err) {
  console.error('[sql]', err.message);
  res.status(500).json({ error: 'Error de base de datos.' });
}

/* ------------------------- Sensores ------------------------- */

router.get('/sensores', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.Sensores ORDER BY FechaCreacion');
    res.json(result.recordset);
  } catch (err) { handleDbError(res, err); }
});

router.post('/sensores', async (req, res) => {
  try {
    const { id, nombre, consumoBase, presionBase, umbral } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'Faltan campos: id, nombre' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('consumoBase', sql.Decimal(6, 2), consumoBase || 0)
      .input('presionBase', sql.Decimal(6, 2), presionBase || 0)
      .input('umbral', sql.Int, umbral ?? 70)
      .query(`INSERT INTO dbo.Sensores (Id, Nombre, ConsumoBase, PresionBase, Umbral)
              VALUES (@id, @nombre, @consumoBase, @presionBase, @umbral)`);
    res.status(201).json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

router.put('/sensores/:id', async (req, res) => {
  try {
    const { nombre, consumoBase, presionBase, umbral, estado } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(50), req.params.id)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('consumoBase', sql.Decimal(6, 2), consumoBase)
      .input('presionBase', sql.Decimal(6, 2), presionBase)
      .input('umbral', sql.Int, umbral)
      .input('estado', sql.NVarChar(20), estado || 'ok')
      .query(`UPDATE dbo.Sensores SET Nombre=@nombre, ConsumoBase=@consumoBase,
              PresionBase=@presionBase, Umbral=@umbral, Estado=@estado WHERE Id=@id`);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

router.delete('/sensores/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar(50), req.params.id)
      .query('DELETE FROM dbo.Sensores WHERE Id=@id');
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

/* ------------------------- Lecturas ------------------------- */

router.post('/lecturas', async (req, res) => {
  try {
    const { sensorId, caudal, presion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('sensorId', sql.NVarChar(50), sensorId)
      .input('caudal', sql.Decimal(6, 2), caudal)
      .input('presion', sql.Decimal(6, 2), presion)
      .query('INSERT INTO dbo.Lecturas (SensorId, Caudal, Presion) VALUES (@sensorId, @caudal, @presion)');
    res.status(201).json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

router.get('/lecturas/:sensorId', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('sensorId', sql.NVarChar(50), req.params.sensorId)
      .query('SELECT TOP 200 * FROM dbo.Lecturas WHERE SensorId=@sensorId ORDER BY Fecha DESC');
    res.json(result.recordset);
  } catch (err) { handleDbError(res, err); }
});

/* ------------------------- Alertas ------------------------- */

router.get('/alertas', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 100 * FROM dbo.Alertas ORDER BY Fecha DESC');
    res.json(result.recordset);
  } catch (err) { handleDbError(res, err); }
});

router.post('/alertas', async (req, res) => {
  try {
    const { sensorNombre, confianza } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('sensorNombre', sql.NVarChar(100), sensorNombre)
      .input('confianza', sql.Int, confianza)
      .query(`INSERT INTO dbo.Alertas (SensorNombre, Confianza)
              OUTPUT INSERTED.Id VALUES (@sensorNombre, @confianza)`);
    res.status(201).json({ ok: true, id: result.recordset[0].Id });
  } catch (err) { handleDbError(res, err); }
});

router.patch('/alertas/:id/resolver', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query('UPDATE dbo.Alertas SET Resuelta=1 WHERE Id=@id');
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

/* ------------------------- Acciones pendientes ------------------------- */

router.get('/acciones', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 100 * FROM dbo.AccionesPendientes ORDER BY Fecha DESC');
    res.json(result.recordset);
  } catch (err) { handleDbError(res, err); }
});

router.post('/acciones', async (req, res) => {
  try {
    const { sensorNombre, tipo, prioridad, detalle } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('sensorNombre', sql.NVarChar(100), sensorNombre)
      .input('tipo', sql.NVarChar(150), tipo)
      .input('prioridad', sql.NVarChar(20), prioridad)
      .input('detalle', sql.NVarChar(500), detalle || null)
      .query(`INSERT INTO dbo.AccionesPendientes (SensorNombre, Tipo, Prioridad, Detalle)
              OUTPUT INSERTED.Id VALUES (@sensorNombre, @tipo, @prioridad, @detalle)`);
    res.status(201).json({ ok: true, id: result.recordset[0].Id });
  } catch (err) { handleDbError(res, err); }
});

router.patch('/acciones/:id', async (req, res) => {
  try {
    const { estado } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('estado', sql.NVarChar(20), estado)
      .query('UPDATE dbo.AccionesPendientes SET Estado=@estado WHERE Id=@id');
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

/* ------------------------- Historial de decisiones ------------------------- */

router.get('/historial', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 200 * FROM dbo.HistorialDecisiones ORDER BY Fecha DESC');
    res.json(result.recordset);
  } catch (err) { handleDbError(res, err); }
});

router.post('/historial', async (req, res) => {
  try {
    const { sensorNombre, evento, decididoPor, resultado } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('sensorNombre', sql.NVarChar(100), sensorNombre)
      .input('evento', sql.NVarChar(200), evento)
      .input('decididoPor', sql.NVarChar(100), decididoPor)
      .input('resultado', sql.NVarChar(200), resultado)
      .query(`INSERT INTO dbo.HistorialDecisiones (SensorNombre, Evento, DecididoPor, Resultado)
              VALUES (@sensorNombre, @evento, @decididoPor, @resultado)`);
    res.status(201).json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});


export default router;
