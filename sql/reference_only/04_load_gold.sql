/* READ ONLY - PRODUCTION VERSION.
   This script creates permanent objects (schemas, tables, functions, procedures, views).
   It needs permissions that a normal analyst login does not have.
   Do NOT run it unless your DBA gives you those permissions. Read it to learn how a
   real warehouse is built. See sql/reference_only/README.md.
   The course itself uses the temp-table scripts in the sql/ folder.            */

/* =====================================================================
   04_load_gold.sql  -  silver -> gold (pseudonymise, SCD2, fact)
   ===================================================================== */

-- Secret salt. Keep it in the database only. NEVER put the real salt in Git.
IF OBJECT_ID(N'etl.secret_salt') IS NULL
BEGIN
    CREATE TABLE etl.secret_salt (salt VARBINARY(32) NOT NULL);
    INSERT etl.secret_salt (salt) VALUES (CRYPT_GEN_RANDOM(32));
END;
GO

CREATE OR ALTER PROCEDURE etl.usp_load_gold
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @salt VARBINARY(32) = (SELECT TOP (1) salt FROM etl.secret_salt);
    DECLARE @now  DATETIME2(0)  = SYSUTCDATETIME();

    BEGIN TRANSACTION;

    /* 1. Latest demographics per patient, with a pseudonymised key */
    DROP TABLE IF EXISTS #src;
    SELECT
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', @salt + CAST(a.nhs_number AS VARBINARY(10))), 2) AS patient_pseudo_id,
        LEFT(a.postcode, CHARINDEX(' ', a.postcode + ' ') - 1) AS postcode_district,
        a.gp_practice_code,
        a.ethnic_code
    INTO #src
    FROM (
        SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.nhs_number ORDER BY s.arrival_dttm DESC, s.attendance_id DESC) AS rn
        FROM silver.attendance AS s
        WHERE s.nhs_status = 'Valid' AND s.arrival_dttm IS NOT NULL
    ) AS a
    WHERE a.rn = 1;

    /* 2. SCD Type 2 - close current rows that changed.
          EXCEPT compares NULLs as equal, so a NULL->NULL is "no change". */
    UPDATE d
    SET valid_to = @now, is_current = 0
    FROM gold.dim_patient AS d
    JOIN #src AS s ON s.patient_pseudo_id = d.patient_pseudo_id
    WHERE d.is_current = 1
      AND EXISTS (SELECT s.postcode_district, s.gp_practice_code, s.ethnic_code
                  EXCEPT
                  SELECT d.postcode_district, d.gp_practice_code, d.ethnic_code);

    /* 3. Insert new patients and new versions of changed patients */
    INSERT gold.dim_patient (patient_pseudo_id, postcode_district, gp_practice_code, ethnic_code, valid_from)
    SELECT s.patient_pseudo_id, s.postcode_district, s.gp_practice_code, s.ethnic_code, @now
    FROM #src AS s
    WHERE NOT EXISTS (SELECT 1 FROM gold.dim_patient AS d
                      WHERE d.patient_pseudo_id = s.patient_pseudo_id AND d.is_current = 1);

    /* 4. Fact table: full reload from silver (only rows with a usable arrival) */
    TRUNCATE TABLE gold.fact_attendance;
    INSERT gold.fact_attendance
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
    FROM silver.attendance AS a
    CROSS APPLY (SELECT CASE WHEN a.departure_dttm >= a.arrival_dttm
                             THEN DATEDIFF_BIG(SECOND, a.arrival_dttm, a.departure_dttm) END AS secs) AS t0
    CROSS APPLY (SELECT CAST(t0.secs AS INT) AS secs) AS t
    LEFT JOIN ref.attendance_disposal AS rd ON rd.disposal_code = a.disposal_code
    WHERE a.arrival_dttm IS NOT NULL
      AND a.arrival_dttm <= @now
      AND CAST(a.arrival_dttm AS DATE) BETWEEN '20240401' AND '20280331';   -- the range of gold.dim_date

    COMMIT TRANSACTION;
END;
GO

EXEC etl.usp_load_gold;
SELECT COUNT(*) AS fact_rows FROM gold.fact_attendance;   -- expect 19945
SELECT * FROM gold.vw_ed_performance_monthly ORDER BY month_start, is_total_row, dept_type;
GO
