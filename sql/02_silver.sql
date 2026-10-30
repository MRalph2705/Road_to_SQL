/* =====================================================================
   02_silver.sql  -  ED SQL: dbo.ED_sandpit (bronze) -> silver
   No permissions needed. It creates TEMPORARY tables in this query window:
     #etl_nhs_check                one row per source row: NHS number check result
     #silver_attendance            clean, validated, de-duplicated: one row per ED episode
     #silver_attendance_diagnosis  one row per diagnosis (Diag1..Diag7 as rows)
     #etl_load_log                 one row per load run (kept when you run this again)
   Run 01_reference.sql first, in the SAME window.
   Safe to run again: it rebuilds the tables and adds a row to the log.
   Production version (function + stored procedure): sql/reference_only/02_silver.sql
   ===================================================================== */

-- 0. Stop here if 01_reference.sql has not run in this window.
--    SET NOEXEC ON makes SQL Server skip every later batch in this script.
IF OBJECT_ID(N'tempdb..#ref_ethnic_category') IS NULL
BEGIN
    RAISERROR('Run sql/01_reference.sql in this query window first. Nothing was changed.', 16, 1);
    SET NOEXEC ON;
END;
GO

/* ---------- 1. NHS number check (Modulus 11), one row per source row ----------
   Production puts this rule in an inline table-valued function. Without CREATE FUNCTION
   permission, we calculate it once and store the result. Every later query reads it.   */
DROP TABLE IF EXISTS #etl_nhs_check;

SELECT r.AE_ID,
       r.NHSNo        AS nhs_raw,
       c.nhs_number,
       c.nhs_status
INTO #etl_nhs_check
FROM dbo.ED_sandpit AS r
CROSS APPLY (SELECT REPLACE(REPLACE(LTRIM(RTRIM(r.NHSNo)), ' ', ''), '-', '') AS nhs) AS n
CROSS APPLY (
    SELECT CASE WHEN n.nhs LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN
               11 - ( ( CAST(SUBSTRING(n.nhs,1,1) AS INT) * 10
                      + CAST(SUBSTRING(n.nhs,2,1) AS INT) * 9
                      + CAST(SUBSTRING(n.nhs,3,1) AS INT) * 8
                      + CAST(SUBSTRING(n.nhs,4,1) AS INT) * 7
                      + CAST(SUBSTRING(n.nhs,5,1) AS INT) * 6
                      + CAST(SUBSTRING(n.nhs,6,1) AS INT) * 5
                      + CAST(SUBSTRING(n.nhs,7,1) AS INT) * 4
                      + CAST(SUBSTRING(n.nhs,8,1) AS INT) * 3
                      + CAST(SUBSTRING(n.nhs,9,1) AS INT) * 2 ) % 11 )
           END AS check_calc
) AS k
CROSS APPLY (
    SELECT CAST(CASE WHEN k.check_calc IS NOT NULL THEN n.nhs END AS CHAR(10)) AS nhs_number,
           CAST(CASE
               WHEN n.nhs IS NULL OR n.nhs = ''      THEN 'Missing'
               WHEN k.check_calc IS NULL             THEN 'Bad format'
               WHEN k.check_calc = 10                THEN 'Invalid'
               WHEN CASE WHEN k.check_calc = 11 THEN 0 ELSE k.check_calc END
                    = CAST(RIGHT(n.nhs, 1) AS INT)   THEN 'Valid'
               ELSE 'Checksum fail'
           END AS VARCHAR(20)) AS nhs_status
) AS c;

CREATE CLUSTERED INDEX cx_nhs_check ON #etl_nhs_check (AE_ID);

/* ---------- 2. Silver tables ----------
   Text columns are as wide as the source (VARCHAR(60)), so the load never stops with
   "String or binary data would be truncated". COLLATE DATABASE_DEFAULT stops Msg 468.
   No constraint names (a name can clash with another window: Msg 2714).
   SQL Server ignores FOREIGN KEY constraints on temp tables, so there is none here.    */
DROP TABLE IF EXISTS #silver_attendance_diagnosis;
DROP TABLE IF EXISTS #silver_attendance;

CREATE TABLE #silver_attendance (
    attendance_id            INT           NOT NULL PRIMARY KEY,   -- AE_ID of the row we kept
    episode_number           VARCHAR(60)   COLLATE DATABASE_DEFAULT NOT NULL UNIQUE,  -- AE_Episode_Number: the business key
    nhs_number               CHAR(10)      COLLATE DATABASE_DEFAULT NULL,
    nhs_status               VARCHAR(20)   COLLATE DATABASE_DEFAULT NOT NULL,
    local_patient_id         VARCHAR(60)   COLLATE DATABASE_DEFAULT NULL,
    date_of_birth            DATE          NULL,       -- NULL when the source has the 1900-01-01 placeholder
    age_at_arrival           SMALLINT      NULL,
    sex                      CHAR(1)       COLLATE DATABASE_DEFAULT NOT NULL,   -- M, F, U
    postcode                 VARCHAR(8)    COLLATE DATABASE_DEFAULT NULL,
    gp_practice_code         VARCHAR(60)   COLLATE DATABASE_DEFAULT NULL,
    ethnic_code              VARCHAR(2)    COLLATE DATABASE_DEFAULT NULL,
    dept_type                TINYINT       NULL,
    attendance_category      TINYINT       NULL,       -- 1 first, 2 planned f/u, 3 unplanned f/u
    arrival_mode_code        TINYINT       NULL,
    arrival_dttm             DATETIME2(0)  NOT NULL,
    triage_dttm              DATETIME2(0)  NULL,
    seen_dttm                DATETIME2(0)  NULL,
    decision_to_admit_dttm   DATETIME2(0)  NULL,
    departure_dttm           DATETIME2(0)  NULL,       -- NULL = still in the department at extract time
    triage_category          TINYINT       NULL,
    chief_complaint_snomed   VARCHAR(60)   COLLATE DATABASE_DEFAULT NULL,
    disposal_code            VARCHAR(60)   COLLATE DATABASE_DEFAULT NULL,
    discharge_dest_snomed    VARCHAR(60)   COLLATE DATABASE_DEFAULT NULL,
    temperature_c            DECIMAL(4,1)  NULL,
    bp_systolic              SMALLINT      NULL,
    bp_diastolic             SMALLINT      NULL,
    weight_kg                DECIMAL(5,1)  NULL,
    dq_flags                 VARCHAR(400)  COLLATE DATABASE_DEFAULT NULL,
    source_modified_dttm     DATETIME2(0)  NULL,
    load_dttm                DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE #silver_attendance_diagnosis (
    attendance_id   INT           NOT NULL,
    diag_position   TINYINT       NOT NULL,
    diag_code       VARCHAR(60)   COLLATE DATABASE_DEFAULT NOT NULL,
    diag_desc       VARCHAR(200)  COLLATE DATABASE_DEFAULT NULL,
    diag_group      VARCHAR(100)  COLLATE DATABASE_DEFAULT NULL,
    PRIMARY KEY (attendance_id, diag_position)
);

-- The log is created only once per window, so it keeps the history of every run.
IF OBJECT_ID(N'tempdb..#etl_load_log') IS NULL
    CREATE TABLE #etl_load_log (
        log_id        INT IDENTITY(1,1) PRIMARY KEY,
        process_name  VARCHAR(100)   NOT NULL,
        started_dttm  DATETIME2(0)   NOT NULL,
        ended_dttm    DATETIME2(0)   NULL,
        rows_read     INT            NULL,
        rows_written  INT            NULL,
        status        VARCHAR(20)    NOT NULL,
        error_message NVARCHAR(4000) NULL
    );
GO

/* ---------- 3. The load: dbo.ED_sandpit -> #silver_attendance ----------
   Production wraps this batch in a stored procedure (etl.usp_load_silver_attendance).
   Here it is a plain batch. The rules are the same: log, transaction, TRY/CATCH, THROW. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @log_id INT, @rows_read INT, @rows_written INT;

INSERT #etl_load_log (process_name, started_dttm, status)
VALUES ('silver.attendance', SYSUTCDATETIME(), 'Running');
SET @log_id = SCOPE_IDENTITY();

BEGIN TRY
    SELECT @rows_read = COUNT(*) FROM dbo.ED_sandpit;

    BEGIN TRANSACTION;

    DELETE FROM #silver_attendance_diagnosis;   -- child first
    DELETE FROM #silver_attendance;             -- full reload: safe to run twice

    WITH ranked AS (
        -- The source sends some episodes twice: same AE_Episode_Number, new AE_ID,
        -- later Modif_DTTM. Keep the latest version of each episode.
        SELECT r.*,
               ROW_NUMBER() OVER (PARTITION BY r.AE_Episode_Number
                                  ORDER BY r.Modif_DTTM DESC, r.AE_ID DESC) AS rn
        FROM dbo.ED_sandpit AS r
    ),
    cleaned AS (
        SELECT
            k.AE_ID, k.AE_Episode_Number, nhs.nhs_number, nhs.nhs_status, k.Unitno,
            CASE WHEN k.DoB > '19000101' THEN k.DoB END                        AS date_of_birth,
            CASE WHEN k.DoB > '19000101' THEN k.Age END                        AS age_at_arrival,
            CASE UPPER(LEFT(LTRIM(k.Sex), 1))
                 WHEN 'F' THEN 'F' WHEN '2' THEN 'F'
                 WHEN 'M' THEN 'M' WHEN '1' THEN 'M'
                 ELSE 'U' END                                                  AS sex,
            pc.postcode,
            LTRIM(RTRIM(k.GPPRAC))                                             AS gp_practice_code,
            e.ethnic_code,
            TRY_CONVERT(TINYINT, REPLACE(k.Attendance_Cat, 'Type ', ''))       AS dept_type,
            TRY_CONVERT(TINYINT, k.Attendance_Category_Code)                   AS attendance_category,
            TRY_CONVERT(TINYINT, k.Arrival_Mode_Code)                          AS arrival_mode_code,
            CAST(k.Arrived_DTTM AS DATETIME2(0))                               AS arrival_dttm,
            CAST(k.Triage_DTTM AS DATETIME2(0))                                AS triage_dttm,
            CAST(k.Seen_DTTM AS DATETIME2(0))                                  AS seen_dttm,
            CAST(k.Decision_To_Admit_DTTM AS DATETIME2(0))                     AS decision_to_admit_dttm,
            CAST(COALESCE(k.ClockStop_DTTM, k.Departed_DTTM) AS DATETIME2(0))  AS departure_dttm,
            CASE WHEN k.Triage_Category BETWEEN 1 AND 5 THEN k.Triage_Category END AS triage_category,
            k.Chief_Complaint_Code, k.Attendance_Disposal_Code, k.Discharge_Destination_Code,
            TRY_CONVERT(DECIMAL(4,1),
                CASE WHEN k.Temperature > 45                 -- recorded in Fahrenheit
                     THEN ROUND((k.Temperature - 32) * 5 / 9.0, 1)
                     ELSE k.Temperature END)                                   AS temperature_c,
            bp.bp_systolic, bp.bp_diastolic,
            TRY_CONVERT(DECIMAL(5,1), CASE WHEN k.Weight_Kg > 0 THEN k.Weight_Kg END) AS weight_kg,   -- 0 = not weighed
            CAST(k.Modif_DTTM AS DATETIME2(0))                                 AS source_modified_dttm
        FROM ranked AS k
        JOIN #etl_nhs_check AS nhs ON nhs.AE_ID = k.AE_ID
        CROSS APPLY (   -- postcode: upper case, no spaces, then one space before the last 3 characters
            SELECT CASE WHEN p.pc LIKE '[A-Z]%[0-9][A-Z][A-Z]' AND LEN(p.pc) BETWEEN 5 AND 7
                        THEN STUFF(p.pc, LEN(p.pc) - 2, 0, ' ') END AS postcode
            FROM (SELECT UPPER(REPLACE(k.Postcode, ' ', '')) AS pc) AS p
        ) AS pc
        CROSS APPLY (   -- blood pressure: '147/93', '147 / 93', '147\93', '147-93' -> two numbers
            SELECT CASE WHEN b.bp LIKE '[0-9]%/[0-9]%'
                        THEN TRY_CONVERT(SMALLINT, LEFT(b.bp, CHARINDEX('/', b.bp) - 1)) END AS bp_systolic,
                   CASE WHEN b.bp LIKE '[0-9]%/[0-9]%'
                        THEN TRY_CONVERT(SMALLINT, SUBSTRING(b.bp, CHARINDEX('/', b.bp) + 1, 3)) END AS bp_diastolic
            FROM (SELECT REPLACE(REPLACE(REPLACE(k.Blood_Pressure, ' ', ''), '\', '/'), '-', '/') AS bp) AS b
        ) AS bp
        LEFT JOIN #ref_ethnic_category AS e
               ON e.ethnic_code = k.Eth_Group_Code COLLATE DATABASE_DEFAULT
        WHERE k.rn = 1
    )
    INSERT #silver_attendance (
        attendance_id, episode_number, nhs_number, nhs_status, local_patient_id, date_of_birth,
        age_at_arrival, sex, postcode, gp_practice_code, ethnic_code, dept_type, attendance_category,
        arrival_mode_code, arrival_dttm, triage_dttm, seen_dttm, decision_to_admit_dttm, departure_dttm,
        triage_category, chief_complaint_snomed, disposal_code, discharge_dest_snomed,
        temperature_c, bp_systolic, bp_diastolic, weight_kg, dq_flags, source_modified_dttm)
    SELECT
        AE_ID, AE_Episode_Number, nhs_number, nhs_status, Unitno, date_of_birth,
        age_at_arrival, sex, postcode, gp_practice_code, ethnic_code, dept_type, attendance_category,
        arrival_mode_code, arrival_dttm, triage_dttm, seen_dttm, decision_to_admit_dttm, departure_dttm,
        triage_category, Chief_Complaint_Code, Attendance_Disposal_Code, Discharge_Destination_Code,
        temperature_c, bp_systolic, bp_diastolic, weight_kg,
        NULLIF(CONCAT_WS(',',
            CASE WHEN nhs_status <> 'Valid'                 THEN 'NHS_' + UPPER(REPLACE(nhs_status, ' ', '_')) END,
            CASE WHEN date_of_birth IS NULL                 THEN 'DOB_PLACEHOLDER' END,
            CASE WHEN departure_dttm IS NULL                THEN 'STILL_IN_DEPARTMENT' END,
            CASE WHEN departure_dttm < arrival_dttm         THEN 'DEPARTURE_BEFORE_ARRIVAL' END,
            CASE WHEN sex = 'U'                             THEN 'SEX_UNKNOWN' END,
            CASE WHEN postcode IS NULL                      THEN 'POSTCODE_INVALID' END,
            CASE WHEN ethnic_code IS NULL                   THEN 'ETHNICITY_MISSING' END,
            CASE WHEN triage_category IS NULL               THEN 'TRIAGE_MISSING' END,
            CASE WHEN bp_systolic IS NULL                   THEN 'BP_UNUSABLE' END
        ), '') AS dq_flags,
        source_modified_dttm
    FROM cleaned;

    SET @rows_written = @@ROWCOUNT;

    -- Repeating group Diag1..Diag7 -> one row per diagnosis (lesson 11)
    INSERT #silver_attendance_diagnosis (attendance_id, diag_position, diag_code, diag_desc, diag_group)
    SELECT r.AE_ID, d.diag_position, d.diag_code, d.diag_desc, d.diag_group
    FROM dbo.ED_sandpit AS r
    JOIN #silver_attendance AS a ON a.attendance_id = r.AE_ID      -- only the rows we kept
    CROSS APPLY (VALUES
        (1, r.Diag1, r.Diag1_Desc, r.Diag1_Group), (2, r.Diag2, r.Diag2_Desc, r.Diag2_Group),
        (3, r.Diag3, r.Diag3_Desc, r.Diag3_Group), (4, r.Diag4, r.Diag4_Desc, r.Diag4_Group),
        (5, r.Diag5, r.Diag5_Desc, r.Diag5_Group), (6, r.Diag6, r.Diag6_Desc, r.Diag6_Group),
        (7, r.Diag7, r.Diag7_Desc, r.Diag7_Group)
    ) AS d (diag_position, diag_code, diag_desc, diag_group)
    WHERE d.diag_code IS NOT NULL;

    COMMIT TRANSACTION;

    UPDATE #etl_load_log
    SET ended_dttm = SYSUTCDATETIME(), rows_read = @rows_read, rows_written = @rows_written, status = 'Succeeded'
    WHERE log_id = @log_id;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    UPDATE #etl_load_log
    SET ended_dttm = SYSUTCDATETIME(), status = 'Failed', error_message = ERROR_MESSAGE()
    WHERE log_id = @log_id;
    THROW;
END CATCH;
GO

-- 4. Check: expect rows_read 20000, rows_written 19945, status Succeeded
SET XACT_ABORT OFF;   -- back to the SSMS default for the rest of your session
SET NOCOUNT OFF;
SELECT TOP (5) * FROM #etl_load_log ORDER BY log_id DESC;
SELECT COUNT(*) AS silver_rows FROM #silver_attendance;   -- expect 19945
GO

SET NOEXEC OFF;   -- always runs: switches normal execution back on
GO
