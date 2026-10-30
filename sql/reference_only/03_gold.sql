/* READ ONLY - PRODUCTION VERSION.
   This script creates permanent objects (schemas, tables, functions, procedures, views).
   It needs permissions that a normal analyst login does not have.
   Do NOT run it unless your DBA gives you those permissions. Read it to learn how a
   real warehouse is built. See sql/reference_only/README.md.
   The course itself uses the temp-table scripts in the sql/ folder.            */

/* =====================================================================
   03_gold.sql  -  star schema and NHS England style measures
   ===================================================================== */

/* ---------- dim_date (NHS financial year starts 1 April) ---------- */
DROP TABLE IF EXISTS gold.dim_date;
CREATE TABLE gold.dim_date (
    date_key        INT          NOT NULL CONSTRAINT pk_dim_date PRIMARY KEY,   -- yyyymmdd
    calendar_date   DATE         NOT NULL,
    month_start     DATE         NOT NULL,
    week_start_mon  DATE         NOT NULL,
    day_name        VARCHAR(10)  NOT NULL,
    is_weekend      BIT          NOT NULL,
    fin_year        CHAR(7)      NOT NULL,   -- e.g. 2025/26
    fin_month_no    TINYINT      NOT NULL    -- April = 1
);

WITH n AS (     -- tally: one row for each day, no loop
    SELECT TOP (DATEDIFF(DAY, '20240401', '20280331') + 1)    -- yyyymmdd: safe in every language setting
           ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS i
    FROM sys.all_objects AS a CROSS JOIN sys.all_objects AS b
), d AS (
    SELECT DATEADD(DAY, i, CAST('20240401' AS DATE)) AS dt FROM n
)
INSERT gold.dim_date
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
GO

/* ---------- dim_patient (SCD Type 2, pseudonymised key) ---------- */
DROP TABLE IF EXISTS gold.dim_patient;
CREATE TABLE gold.dim_patient (
    patient_sk        INT IDENTITY(1,1) CONSTRAINT pk_dim_patient PRIMARY KEY,
    patient_pseudo_id CHAR(64)     NOT NULL,     -- SHA2-256 of salt + NHS number (lesson 15)
    postcode_district VARCHAR(4)   NULL,         -- outward code only: less identifiable
    gp_practice_code  VARCHAR(60)  NULL,
    ethnic_code       VARCHAR(2)   NULL,
    valid_from        DATETIME2(0) NOT NULL,
    valid_to          DATETIME2(0) NOT NULL CONSTRAINT df_dim_patient_to DEFAULT '99991231',
    is_current        BIT          NOT NULL CONSTRAINT df_dim_patient_cur DEFAULT 1
);
CREATE UNIQUE INDEX ux_dim_patient_current
    ON gold.dim_patient (patient_pseudo_id) WHERE is_current = 1;
GO

/* ---------- fact_attendance ---------- */
DROP TABLE IF EXISTS gold.fact_attendance;
CREATE TABLE gold.fact_attendance (
    attendance_id         INT          NOT NULL CONSTRAINT pk_fact_att PRIMARY KEY,
    arrival_date_key      INT          NOT NULL,
    patient_pseudo_id     CHAR(64)     NULL,
    dept_type             TINYINT      NULL,
    attendance_category   TINYINT      NULL,
    triage_category       TINYINT      NULL,
    disposal_code         VARCHAR(60)  NULL,
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

/* ---------- views: the measures people ask for ---------- */

-- Monthly 4-hour and 12-hour performance by department type, with an all-types total.
CREATE OR ALTER VIEW gold.vw_ed_performance_monthly
AS
SELECT
    d.month_start,
    IIF(GROUPING(f.dept_type) = 1, 'All', COALESCE(CAST(f.dept_type AS VARCHAR(10)), 'Unknown')) AS dept_type,
    COUNT(*)                                          AS attendances,
    SUM(CAST(f.within_4h AS INT))                     AS within_4h,
    CAST(100.0 * SUM(CAST(f.within_4h AS INT)) / NULLIF(COUNT(f.within_4h), 0) AS DECIMAL(5,1)) AS pct_within_4h,
    SUM(CAST(f.over_12h_from_arrival AS INT))         AS over_12h_from_arrival,
    GROUPING(f.dept_type)                             AS is_total_row
FROM gold.fact_attendance AS f
JOIN gold.dim_date        AS d ON d.date_key = f.arrival_date_key
GROUP BY GROUPING SETS ((d.month_start, f.dept_type), (d.month_start));
GO
