-- ============================================================
-- AquaSense IA — Esquema de base de datos para SQL Server 2022
-- ============================================================
-- Cómo ejecutarlo:
--   1. Abre SQL Server Management Studio (SSMS) o el SQL Server Object
--      Explorer de Visual Studio, conectado a tu instancia de SQL Server 2022.
--   2. Abre este archivo y ejecútalo completo (F5 en SSMS).
--   3. Quedará creada la base de datos "AquaSenseDB" con sus 5 tablas.
-- ============================================================

IF DB_ID('AquaSenseDB') IS NULL
BEGIN
    CREATE DATABASE AquaSenseDB;
END
GO

USE AquaSenseDB;
GO

-- Sensores instalados (Cocina, Baño, Riego, Medidor general, o los que agregues
-- desde el Panel Admin del prototipo).
IF OBJECT_ID('dbo.Sensores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sensores (
        Id              NVARCHAR(50)    NOT NULL PRIMARY KEY,
        Nombre          NVARCHAR(100)   NOT NULL,
        ConsumoBase     DECIMAL(6,2)    NOT NULL,
        PresionBase     DECIMAL(6,2)    NOT NULL,
        Umbral          INT             NOT NULL DEFAULT 70,
        Estado          NVARCHAR(20)    NOT NULL DEFAULT 'ok',
        FechaCreacion   DATETIME2       NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

-- Lecturas de caudal/presión a lo largo del tiempo (histórico real, no simulado).
IF OBJECT_ID('dbo.Lecturas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Lecturas (
        Id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SensorId    NVARCHAR(50)      NOT NULL,
        Caudal      DECIMAL(6,2)      NOT NULL,
        Presion     DECIMAL(6,2)      NOT NULL,
        Fecha       DATETIME2         NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_Lecturas_Sensores FOREIGN KEY (SensorId) REFERENCES dbo.Sensores(Id)
    );
END
GO

-- Alertas generadas por el Agente Detección.
IF OBJECT_ID('dbo.Alertas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Alertas (
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SensorNombre    NVARCHAR(100)     NOT NULL,
        Confianza       INT               NOT NULL,
        Resuelta        BIT               NOT NULL DEFAULT 0,
        Fecha           DATETIME2         NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

-- Propuestas del Agente Ejecutor que esperan aprobación humana.
IF OBJECT_ID('dbo.AccionesPendientes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AccionesPendientes (
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SensorNombre    NVARCHAR(100)     NOT NULL,
        Tipo            NVARCHAR(150)     NOT NULL,
        Prioridad       NVARCHAR(20)      NOT NULL,
        Detalle         NVARCHAR(500)     NULL,
        Estado          NVARCHAR(20)      NOT NULL DEFAULT 'pendiente',
        Fecha           DATETIME2         NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

-- Historial de decisiones (automáticas y manuales) para trazabilidad y reportes.
IF OBJECT_ID('dbo.HistorialDecisiones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HistorialDecisiones (
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SensorNombre    NVARCHAR(100)     NOT NULL,
        Evento          NVARCHAR(200)     NOT NULL,
        DecididoPor     NVARCHAR(100)     NOT NULL,
        Resultado       NVARCHAR(200)     NOT NULL,
        Fecha           DATETIME2         NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

-- Datos iniciales: los 4 sensores que ya trae el prototipo por defecto.
IF NOT EXISTS (SELECT 1 FROM dbo.Sensores)
BEGIN
    INSERT INTO dbo.Sensores (Id, Nombre, ConsumoBase, PresionBase, Umbral, Estado) VALUES
    ('general', 'Medidor general', 6.2, 3.1, 60, 'ok'),
    ('cocina',  'Cocina',           1.1, 2.4, 75, 'ok'),
    ('bano',    'Baño principal',   0.8, 2.2, 65, 'ok'),
    ('jardin',  'Riego de jardín',  2.4, 2.8, 80, 'ok');
END
GO

PRINT 'Esquema de AquaSenseDB listo.';


/* ---------------- v2: trazas de los agentes (auditoría, E9/H4) ---------------- */
IF OBJECT_ID('dbo.TrazasAgentes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TrazasAgentes (
        Id          NVARCHAR(40)   NOT NULL PRIMARY KEY,
        Fecha       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        Mensaje     NVARCHAR(600)  NOT NULL,
        Respuesta   NVARCHAR(MAX)  NULL,
        Agentes     NVARCHAR(200)  NULL,
        Ms          INT            NULL,
        TokensIn    INT            NULL,
        TokensOut   INT            NULL,
        CostoUsd    DECIMAL(10,6)  NULL,
        Abortado    NVARCHAR(60)   NULL,
        EventosJson NVARCHAR(MAX)  NULL
    );
END
GO
