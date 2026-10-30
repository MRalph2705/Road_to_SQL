/* =====================================================================
   00_check_access.sql  -  ED SQL
   Read only. This script changes nothing and creates nothing permanent.
   Run it in the database that holds dbo.ED_sandpit.
   It tells you what your login can do, so you know which parts of the
   course run on your server.
   ===================================================================== */

-- 1. Is the source table here?
IF OBJECT_ID(N'dbo.ED_sandpit', N'U') IS NULL
    THROW 50000, 'dbo.ED_sandpit is not in this database. Select the correct database in the SSMS toolbar and run again.', 1;

SELECT COUNT(*)                          AS rows_in_ed_sandpit,       -- expect 20000
       COUNT(DISTINCT AE_Episode_Number) AS distinct_episodes,        -- expect 19945
       MIN(Arrived_DTTM)                 AS first_arrival,
       MAX(Arrived_DTTM)                 AS last_arrival
FROM dbo.ED_sandpit;
GO

-- 2. Server, database and settings.
SELECT
    CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20))        AS product_version,   -- 14.x = 2017, 15.x = 2019, 16.x = 2022
    DB_NAME()                                                    AS database_name,
    (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS compatibility_level,
    DATABASEPROPERTYEX(DB_NAME(), 'Collation')                   AS database_collation,  -- _CI_ = case-insensitive
    (SELECT collation_name FROM sys.columns
     WHERE object_id = OBJECT_ID(N'dbo.ED_sandpit') AND name = N'Sex') AS ed_sandpit_text_collation;
GO

-- 3. What can your login create? 1 = yes, 0 = no.
--    The course needs NONE of these. It uses temporary tables (#name), which every login can create.
--    The "reference_only" scripts need them. Show this result to your DBA if you want them.
SELECT
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE SCHEMA')    AS can_create_schema,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE')     AS can_create_table,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE VIEW')      AS can_create_view,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE PROCEDURE') AS can_create_procedure,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE FUNCTION')  AS can_create_function,
    HAS_PERMS_BY_NAME(N'dbo.ED_sandpit', 'OBJECT', 'SELECT')     AS can_read_ed_sandpit;
GO

-- 4. Prove that temporary tables work for you.
DROP TABLE IF EXISTS #access_test;
CREATE TABLE #access_test (x INT NOT NULL);
INSERT #access_test (x) VALUES (1);
SELECT 'Temp tables work. You can do the whole course.' AS result FROM #access_test;
DROP TABLE #access_test;
GO
