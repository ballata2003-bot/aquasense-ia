// Conexión a SQL Server 2022 usando el driver oficial "mssql".
// Todos los valores salen de variables de entorno (.env) — nunca hardcodees
// usuario/contraseña aquí.

import sql from 'mssql';
import 'dotenv/config';

const useWindowsAuth = String(process.env.DB_USE_WINDOWS_AUTH || 'false').toLowerCase() === 'true';

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'AquaSenseDB',
  port: Number(process.env.DB_PORT) || 1433,
  options: {
    encrypt: String(process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true',
    // true solo para desarrollo local. En producción define DB_TRUST_SERVER_CERT=false y usa un certificado real.
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERT || 'true').toLowerCase() === 'true',
  },
};

if (!useWindowsAuth) {
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
} else {
  // Autenticación integrada de Windows (requiere el paquete "msnodesqlv8";
  // ver README-SQLSERVER.md si prefieres esta opción en vez de usuario/contraseña SQL).
  config.driver = 'msnodesqlv8';
  config.authentication = { type: 'ntlm', options: { domain: '', userName: '', password: '' } };
}

let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log('[db] Conectado a SQL Server:', config.server, '/', config.database);
        return pool;
      })
      .catch(err => {
        poolPromise = null; // permite reintentar en la siguiente llamada
        console.error('[db] Error al conectar a SQL Server:', err.message);
        throw err;
      });
  }
  return poolPromise;
}

export { sql };
