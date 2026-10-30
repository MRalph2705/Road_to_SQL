/* READ ONLY - PRODUCTION VERSION.
   This script creates permanent objects (schemas, tables, functions, procedures, views).
   It needs permissions that a normal analyst login does not have.
   Do NOT run it unless your DBA gives you those permissions. Read it to learn how a
   real warehouse is built. See sql/reference_only/README.md.
   The course itself uses the temp-table scripts in the sql/ folder.            */

/* =====================================================================
   00_setup.sql  -  ED SQL
   Run this in the database that holds dbo.ED_sandpit.
   Written for SQL Server 2017 (version 14.x). Also runs on 2019, 2022 and 2025.
   It does NOT change dbo.ED_sandpit. dbo.ED_sandpit is your raw (bronze) layer.
   ===================================================================== */

-- Step 1. Check that the source table is here.
IF OBJECT_ID(N'dbo.ED_sandpit', N'U') IS NULL
    THROW 50000, 'dbo.ED_sandpit is not in this database. Change database (USE ...) and run again.', 1;

SELECT COUNT(*)                          AS rows_in_ed_sandpit,       -- expect 20000
       COUNT(DISTINCT AE_Episode_Number) AS distinct_episodes,        -- expect 19945
       MIN(Arrived_DTTM)                 AS first_arrival,
       MAX(Arrived_DTTM)                 AS last_arrival
FROM dbo.ED_sandpit;
GO

-- Step 2. Use the SQL Server 2017 feature set (STRING_SPLIT and OPENJSON need level 130+).
--   You need the ALTER permission on the database. If you do not have it, the script
--   prints a message and continues. Then ask your DBA to set level 140.
DECLARE @db SYSNAME = DB_NAME(), @sql NVARCHAR(400);
IF (SELECT compatibility_level FROM sys.databases WHERE name = @db) < 140
BEGIN
    BEGIN TRY
        SET @sql = N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET COMPATIBILITY_LEVEL = 140;';
        EXEC (@sql);
        PRINT 'Compatibility level set to 140.';
    END TRY
    BEGIN CATCH
        PRINT 'Could not change the compatibility level: ' + ERROR_MESSAGE();
        PRINT 'Lessons 6 and Think 5 need level 130 or higher (STRING_SPLIT, OPENJSON).';
    END CATCH;
END;
GO

-- Step 3. Create one schema for each layer.
--   dbo.ED_sandpit = bronze: raw data as received. Never edit it.
--   silver = cleaned, typed, de-duplicated      gold = business-ready model
--   ref    = lookup tables                      etl  = load code and log
--   dq     = data-quality tests
IF SCHEMA_ID(N'silver') IS NULL EXEC (N'CREATE SCHEMA silver');
IF SCHEMA_ID(N'gold')   IS NULL EXEC (N'CREATE SCHEMA gold');
IF SCHEMA_ID(N'ref')    IS NULL EXEC (N'CREATE SCHEMA ref');
IF SCHEMA_ID(N'etl')    IS NULL EXEC (N'CREATE SCHEMA etl');
IF SCHEMA_ID(N'dq')     IS NULL EXEC (N'CREATE SCHEMA dq');
GO

-- Step 4. Show the collation. It changes how text comparisons work (lesson 1).
SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS database_collation;   -- _CI_ = case-insensitive
GO
