/* =====================================================================
   03_gold.sql  -  ED SQL: silver -> gold (star schema, SCD2, pseudonymisation)
   No permissions needed. It creates TEMPORARY tables in this query window:
     #gold_dim_date          one row per day, NHS financial year (starts 1 April)
     #gold_dim_patient       SCD Type 2 patient dimension with a pseudonymised key
     #gold_fact_attendance   one row per ED attendance
     #etl_secret_salt        the salt for pseudonymisation (one per window)
   Run 01 and 02 first, in the SAME window.
   Safe to run again. #gold_dim_patient is kept, so a second run tests the SCD2 step.
   Production version (tables, view, stored procedure): sql/reference_only/03_gold.sql
   and sql/reference_only/04_load_gold.sql
   ===================================================================== */

IF OBJECT_ID(N'tempdb..#silver_attendance') IS NULL
BEGIN
    RAISERROR('Run sql/01_reference.sql and sql/02_silver.sql in this query window first. Nothing was changed.', 16, 1);
    SET NOEXEC ON;
END;
GO

/* ---------- 1. dim_date (NHS financial year starts 1 April) ---------- */
DROP TABLE IF EXISTS #gold_dim_date;
CREATE TABLE #gold_dim_date (
    date_key        INT          NOT NULL PRIMARY KEY,   -- yyyymmdd
    calendar_date   DATE         NOT NULL,
    month_start     DATE         NOT NULL,
    week_start_mon  DATE         NOT NULL,
    day_name        VARCHAR(10)  COLLATE DATABASE_DEFAULT NOT NULL,
    is_weekend      BIT          NOT NULL,
    fin_year        CHAR(7)      COLLATE DATABASE_DEFAULT NOT NULL,   -- e.g. 2025/26
    fin_month_no    TINYINT      NOT NULL    -- April = 1
);

WITH n AS (     -- tally: one row for each day, no loop
    SELECT TOP (DATEDIFF(DAY, '20240401', '20280331') + 1)    -- yyyymmdd: safe in every language setting
           ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i
    FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b
), d AS (
    SELECT DATEADD(DAY, i, CAST('20240401' AS DATE)) AS dt FROM n
)
INSERT #gold_dim_date (date_key, calendar_date, month_start, week_start_mon, day_name, is_weekend, fin_year, fin_month_no)
SELECT
    YEAR(dt) * 10000 + MONTH(dt) * 100 + DAY(dt),
    dt,
    DATEFROMPARTS(YEAR(dt), MONTH(dt), 1),
    DATEADD(DAY, -((DATEPART(WEEKDAY, dt) + @@DATEFIRST - 2) % 7), dt),
    DATENAME(WEEKDAY, dt),
    CASE WHEN (DATEPART(WEEKDAY, dt) + @@DATEFIRST - 2) % 7 >= 5 THEN 1 ELSE 0 END,
    CONCAT(fy, '/', RIGHT(fy + 1, 2)),
    ((MONTH(dt) + 8) % 12) + 1
FROM d
CROSS APPLY (SELECT CASE WHEN MONTH(dt) >= 4 THEN YEAR(dt) ELSE YEAR(dt) - 1 END AS fy) AS f;

/* ---------- 2. The secret salt ----------
   Production keeps one salt in a locked table for ever. Here each query window makes
   its own salt, so pseudo IDs change when you open a new window. Counts do not change. */
IF OBJECT_ID(N'tempdb..#etl_secret_salt') IS NULL
BEGIN
    CREATE TABLE #etl_secret_salt (salt VARBINARY(32) NOT NULL);
    INSERT #etl_secret_salt (salt) VALUES (CRYPT_GEN_RANDOM(32));
END;

/* ---------- 3. dim_patient (SCD Type 2) - created once, then kept ---------- */
IF OBJECT_ID(N'tempdb..#gold_dim_patient') IS NULL
BEGIN
    CREATE TABLE #gold_dim_patient (
        patient_sk        INT IDENTITY(1,1) PRIMARY KEY,
        patient_pseudo_id CHAR(64)     COLLATE DATABASE_DEFAULT NOT NULL,   -- SHA2-256 of salt + NHS number (lesson 15)
        postcode_district VARCHAR(4)   COLLATE DATABASE_DEFAULT NULL,       -- outward code only: less identifiable
        gp_practice_code  VARCHAR(60)  COLLATE DATABASE_DEFAULT NULL,
        ethnic_code       VARCHAR(2)   COLLATE DATABASE_DEFAULT NULL,
        valid_from        DATETIME2(0) NOT NULL,
        valid_to          DATETIME2(0) NOT NULL DEFAULT '99991231',
        is_current        BIT          NOT NULL DEFAULT 1
    );
    -- One current row per patient. A filtered unique index stops a second current row.
    CREATE UNIQUE INDEX ux_dim_patient_current ON #gold_dim_patient (patient_pseudo_id) WHERE is_current = 1;
END;

/* ---------- 4. fact_attendance ---------- */
DROP TABLE IF EXISTS #gold_fact_attendance;
CREATE TABLE #gold_fact_attendance (
    attendance_id         INT          NOT NULL PRIMARY KEY,
    arrival_date_key      INT          NOT NULL,
    patient_pseudo_id     CHAR(64)     COLLATE DATABASE_DEFAULT NULL,
    dept_type             TINYINT      NULL,
    attendance_category   TINYINT      NULL,
    triage_category       TINYINT      NULL,
    disposal_code         VARCHAR(60)  COLLATE DATABASE_DEFAULT NULL,
    age_at_arrival        SMALLINT     NULL,
    is_mental_health_cc   BIT          NOT NULL,
    mins_to_triage        INT          NULL,
    mins_to_seen          INT          NULL,
    secs_in_department    INT          NULL,
    within_4h             BIT          NULL,
    over_12h_from_arrival BIT          NULL,
    over_24h              BIT          NULL,
    is_admitted           BIT          NOT NULL,
    left_before_treatment BIT          NOT NULL
);
GO

/* ---------- 5. The gold load ----------
   Production wraps this batch in a stored procedure (etl.usp_load_gold).            */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @salt VARBINARY(32) = (SELECT TOP (1) salt FROM #etl_secret_salt);
DECLARE @now  DATETIME2(0)  = SYSUTCDATETIME();

BEGIN TRANSACTION;

/* 5.1 Latest demographics per patient, with a pseudonymised key */
DROP TABLE IF EXISTS #src;
SELECT
    CONVERT(CHAR(64), HASHBYTES('SHA2_256', @salt + CAST(a.nhs_number AS VARBINARY(10))), 2) AS patient_pseudo_id,
    LEFT(a.postcode, CHARINDEX(' ', a.postcode + ' ') - 1) AS postcode_district,
    a.gp_practice_code,
    a.ethnic_code
INTO #src
FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.nhs_number ORDER BY s.arrival_dttm DESC, s.attendance_id DESC) AS rn
    FROM #silver_attendance AS s
    WHERE s.nhs_status = 'Valid' AND s.arrival_dttm IS NOT NULL
) AS a
WHERE a.rn = 1;

/* 5.2 SCD Type 2 - close current rows that changed.
       EXCEPT compares NULLs as equal, so a NULL->NULL is "no change". */
UPDATE d
SET valid_to = @now, is_current = 0
FROM #gold_dim_patient AS d
JOIN #src AS s ON s.patient_pseudo_id = d.patient_pseudo_id
WHERE d.is_current = 1
  AND EXISTS (SELECT s.postcode_district, s.gp_practice_code, s.ethnic_code
              EXCEPT
              SELECT d.postcode_district, d.gp_practice_code, d.ethnic_code);

/* 5.3 Insert new patients and new versions of changed patients */
INSERT #gold_dim_patient (patient_pseudo_id, postcode_district, gp_practice_code, ethnic_code, valid_from)
SELECT s.patient_pseudo_id, s.postcode_district, s.gp_practice_code, s.ethnic_code, @now
FROM #src AS s
WHERE NOT EXISTS (SELECT 1 FROM #gold_dim_patient AS d
                  WHERE d.patient_pseudo_id = s.patient_pseudo_id AND d.is_current = 1);

/* 5.4 Fact table: full reload from silver (only rows with a usable arrival) */
DELETE FROM #gold_fact_attendance;
INSERT #gold_fact_attendance (
    attendance_id, arrival_date_key, patient_pseudo_id, dept_type, attendance_category, triage_category,
    disposal_code, age_at_arrival, is_mental_health_cc, mins_to_triage, mins_to_seen, secs_in_department,
    within_4h, over_12h_from_arrival, over_24h, is_admitted, left_before_treatment)
SELECT
    a.attendance_id,
    YEAR(a.arrival_dttm) * 10000 + MONTH(a.arrival_dttm) * 100 + DAY(a.arrival_dttm),
    CASE WHEN a.nhs_status = 'Valid'
         THEN CONVERT(CHAR(64), HASHBYTES('SHA2_256', @salt + CAST(a.nhs_number AS VARBINARY(10))), 2) END,
    a.dept_type, a.attendance_category, a.triage_category, a.disposal_code, a.age_at_arrival,
    CASE WHEN a.chief_complaint_snomed = '225444004' THEN 1 ELSE 0 END,      -- practice code only
    CASE WHEN a.triage_dttm >= a.arrival_dttm THEN DATEDIFF(MINUTE, a.arrival_dttm, a.triage_dttm) END,
    CASE WHEN a.seen_dttm   >= a.arrival_dttm THEN DATEDIFF(MINUTE, a.arrival_dttm, a.seen_dttm)   END,
    t.secs,
    CASE WHEN t.secs IS NULL THEN NULL WHEN t.secs <= 4 * 3600  THEN 1 ELSE 0 END,
    CASE WHEN t.secs IS NULL THEN NULL WHEN t.secs >  12 * 3600 THEN 1 ELSE 0 END,
    CASE WHEN t.secs IS NULL THEN NULL WHEN t.secs >  24 * 3600 THEN 1 ELSE 0 END,
    COALESCE(rd.is_admitted, 0),
    COALESCE(rd.is_left_before_treatment, 0)
FROM #silver_attendance AS a
CROSS APPLY (SELECT CASE WHEN a.departure_dttm >= a.arrival_dttm
                         THEN DATEDIFF_BIG(SECOND, a.arrival_dttm, a.departure_dttm) END AS secs) AS t0
CROSS APPLY (SELECT CAST(t0.secs AS INT) AS secs) AS t
LEFT JOIN #ref_attendance_disposal AS rd ON rd.disposal_code = a.disposal_code
WHERE a.arrival_dttm IS NOT NULL
  AND a.arrival_dttm <= @now
  AND CAST(a.arrival_dttm AS DATE) BETWEEN '20240401' AND '20280331';   -- the range of #gold_dim_date

COMMIT TRANSACTION;
DROP TABLE IF EXISTS #src;
SET XACT_ABORT OFF;
SET NOCOUNT OFF;
GO

/* ---------- 6. Monthly 4-hour and 12-hour performance ----------
   Production saves this query as a view (gold.vw_ed_performance_monthly).
   Without CREATE VIEW permission, run the query. It gives the same table.        */
SELECT
    d.month_start,
    IIF(GROUPING(f.dept_type) = 1, 'All', COALESCE(CAST(f.dept_type AS VARCHAR(10)), 'Unknown')) AS dept_type_label,
    COUNT(*)                                          AS attendances,
    SUM(CAST(f.within_4h AS INT))                     AS within_4h,
    CAST(100.0 * SUM(CAST(f.within_4h AS INT)) / NULLIF(COUNT(f.within_4h), 0) AS DECIMAL(5,1)) AS pct_within_4h,
    SUM(CAST(f.over_12h_from_arrival AS INT))         AS over_12h_from_arrival,
    GROUPING(f.dept_type)                             AS is_total_row
FROM #gold_fact_attendance AS f
JOIN #gold_dim_date        AS d ON d.date_key = f.arrival_date_key
GROUP BY GROUPING SETS ((d.month_start, f.dept_type), (d.month_start))
ORDER BY d.month_start, is_total_row, dept_type_label;

SELECT COUNT(*) AS fact_rows FROM #gold_fact_attendance;   -- expect 19945
SELECT COUNT(*) AS dim_patient_rows FROM #gold_dim_patient; -- expect 12357 after the first run
GO

SET NOEXEC OFF;   -- always runs: switches normal execution back on
GO
