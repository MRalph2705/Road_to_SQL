/* =====================================================================
   run_all_in_this_window.sql  -  ED SQL practice-session build
   GENERATED from sql/01 to sql/04 by tools/gen_check_script.js. Do not edit by hand.
   No permissions needed: it creates temporary tables (#name) only.
   1. Open a new query window on the database that holds dbo.ED_sandpit.
   2. Run this whole file (F5). It takes about 10 seconds.
   3. Do the lessons in the SAME window. Temp tables are deleted when you close it.
   ===================================================================== */

/* ######################## sql/01_reference.sql ######################## */
/* =====================================================================
   01_reference.sql  -  ED SQL: lookup (reference) tables
   No permissions needed. It creates TEMPORARY tables (#ref_...).
   A temp table lives only in the query window that made it. Run this
   script, then do the lessons in the SAME window. A new window starts empty.
   Practice values only. Check every code against the NHS Data Dictionary
   and the ECDS Technical Output Specification (ETOS) before real use.
   Production version (permanent ref schema): sql/reference_only/01_reference.sql
   ===================================================================== */

-- Text columns use COLLATE DATABASE_DEFAULT. Without it, a temp table takes the
-- collation of tempdb, and a join to dbo.ED_sandpit can fail with Msg 468.
-- Constraints have no names: a named constraint on a temp table can clash with
-- another user's window (Msg 2714).

-- Ethnic category (NHS Data Dictionary, 2001 census categories)
DROP TABLE IF EXISTS #ref_ethnic_category;
CREATE TABLE #ref_ethnic_category (
    ethnic_code  VARCHAR(2)   COLLATE DATABASE_DEFAULT NOT NULL PRIMARY KEY,
    description  VARCHAR(100) COLLATE DATABASE_DEFAULT NOT NULL,
    broad_group  VARCHAR(30)  COLLATE DATABASE_DEFAULT NOT NULL
);
INSERT #ref_ethnic_category (ethnic_code, description, broad_group) VALUES
 ('A','British','White'),('B','Irish','White'),('C','Any other White background','White'),
 ('D','White and Black Caribbean','Mixed'),('E','White and Black African','Mixed'),
 ('F','White and Asian','Mixed'),('G','Any other mixed background','Mixed'),
 ('H','Indian','Asian or Asian British'),('J','Pakistani','Asian or Asian British'),
 ('K','Bangladeshi','Asian or Asian British'),('L','Any other Asian background','Asian or Asian British'),
 ('M','Caribbean','Black or Black British'),('N','African','Black or Black British'),
 ('P','Any other Black background','Black or Black British'),
 ('R','Chinese','Other ethnic groups'),('S','Any other ethnic group','Other ethnic groups'),
 ('Z','Not stated','Not stated'),('99','Not known','Not known');

-- Attendance disposal (legacy CDS A&E codes, as used in dbo.ED_sandpit)
DROP TABLE IF EXISTS #ref_attendance_disposal;
CREATE TABLE #ref_attendance_disposal (
    disposal_code VARCHAR(60)  COLLATE DATABASE_DEFAULT NOT NULL PRIMARY KEY,
    description   VARCHAR(120) COLLATE DATABASE_DEFAULT NOT NULL,
    is_admitted   BIT          NOT NULL,
    is_left_before_treatment BIT NOT NULL
);
INSERT #ref_attendance_disposal (disposal_code, description, is_admitted, is_left_before_treatment) VALUES
 ('01','Admitted to hospital bed / became a lodged patient',1,0),
 ('02','Discharged - follow up treatment to be provided by GP',0,0),
 ('03','Discharged - did not require any follow up treatment',0,0),
 ('04','Referred to ED Department clinic',0,0),
 ('05','Referred to fracture clinic',0,0),
 ('06','Referred to other out-patient clinic',0,0),
 ('07','Transferred to other health care provider',0,0),
 ('10','Died in department',0,0),
 ('11','Referred to other health care professional',0,0),
 ('12','Left department before being treated',0,1),
 ('13','Left department having refused treatment',0,1),
 ('14','Other',0,0);

-- Discharge destination (SNOMED CT codes as used in dbo.ED_sandpit)
DROP TABLE IF EXISTS #ref_discharge_destination;
CREATE TABLE #ref_discharge_destination (
    snomed_code  VARCHAR(60)  COLLATE DATABASE_DEFAULT NOT NULL PRIMARY KEY,
    description  VARCHAR(100) COLLATE DATABASE_DEFAULT NOT NULL
);
INSERT #ref_discharge_destination (snomed_code, description) VALUES
 ('306689006','Discharged to usual place of residence'),
 ('306706006','Admitted to ward'),
 ('19712007','Transferred to another hospital'),
 ('1066391000000105','Discharged to care home'),
 ('306705005','Discharged to police custody'),
 ('305398007','Transferred to mortuary');

-- Tip: build a lookup from the source first, then own it:
-- SELECT DISTINCT Attendance_Disposal_Code, Attendance_Disposal FROM dbo.ED_sandpit ORDER BY 1;

-- Triage acuity
DROP TABLE IF EXISTS #ref_triage_category;
CREATE TABLE #ref_triage_category (
    triage_category TINYINT     NOT NULL PRIMARY KEY,
    description     VARCHAR(30) COLLATE DATABASE_DEFAULT NOT NULL,
    target_minutes  SMALLINT    NOT NULL
);
INSERT #ref_triage_category (triage_category, description, target_minutes) VALUES
 (1,'Immediate',0),(2,'Very urgent',10),(3,'Urgent',60),(4,'Standard',120),(5,'Non-urgent',240);

-- Department type
DROP TABLE IF EXISTS #ref_department_type;
CREATE TABLE #ref_department_type (
    dept_type   TINYINT     NOT NULL PRIMARY KEY,
    description VARCHAR(80) COLLATE DATABASE_DEFAULT NOT NULL
);
INSERT #ref_department_type (dept_type, description) VALUES
 (1,'Type 1 - consultant-led 24 hour emergency department'),
 (2,'Type 2 - consultant-led single specialty'),
 (3,'Type 3 - other A&E / minor injury unit'),
 (4,'Type 4 - NHS walk-in centre');
-- Note: urgent treatment centres (UTCs) report as Type 3 or Type 4.

SELECT COUNT(*) AS ethnic_codes FROM #ref_ethnic_category;   -- expect 18
GO

/* ######################## sql/02_silver.sql ######################## */
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

/* ######################## sql/03_gold.sql ######################## */
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

/* ######################## sql/04_dq_tests.sql ######################## */
/* =====================================================================
   04_dq_tests.sql  -  ED SQL: data-quality tests, the verifier in your loop
   No permissions needed. It creates a TEMPORARY table in this query window:
     #dq_test_result   one row per test per run (kept when you run this again)
   Run 01 and 02 first, in the SAME window.
   Each test returns a number. A rule says pass or fail.
   Production version (stored procedure dq.usp_run_tests): sql/reference_only/05_dq_tests.sql
   ===================================================================== */

IF OBJECT_ID(N'tempdb..#silver_attendance') IS NULL
BEGIN
    RAISERROR('Run sql/01_reference.sql and sql/02_silver.sql in this query window first. Nothing was changed.', 16, 1);
    SET NOEXEC ON;
END;
GO

IF OBJECT_ID(N'tempdb..#dq_test_result') IS NULL
    CREATE TABLE #dq_test_result (
        run_id       UNIQUEIDENTIFIER NOT NULL,
        run_dttm     DATETIME2(0)     NOT NULL,
        test_name    VARCHAR(100)     COLLATE DATABASE_DEFAULT NOT NULL,
        measured     DECIMAL(18,2)    NULL,
        threshold    DECIMAL(18,2)    NOT NULL,
        rule_text    VARCHAR(200)     COLLATE DATABASE_DEFAULT NOT NULL,
        passed       BIT              NOT NULL
    );
GO

-- Change to 1 to see what a nightly job does: it stops with Msg 50001 when a test fails.
DECLARE @fail_on_error BIT = 0;
DECLARE @run UNIQUEIDENTIFIER = NEWID(), @now DATETIME2(0) = SYSUTCDATETIME();

WITH m AS (
    SELECT
        (SELECT COUNT(*) FROM #silver_attendance)                                         AS silver_rows,
        (SELECT COUNT(DISTINCT AE_Episode_Number) FROM dbo.ED_sandpit)                    AS source_distinct_episodes,
        (SELECT 100.0 * AVG(CASE WHEN nhs_status = 'Valid' THEN 1.0 ELSE 0 END) FROM #silver_attendance) AS pct_nhs_valid,
        (SELECT 100.0 * AVG(CASE WHEN ethnic_code IS NOT NULL AND ethnic_code NOT IN ('Z','99') THEN 1.0 ELSE 0 END)
           FROM #silver_attendance)                                                       AS pct_ethnicity_known,
        (SELECT 100.0 * AVG(CASE WHEN chief_complaint_snomed IS NOT NULL THEN 1.0 ELSE 0 END)
           FROM #silver_attendance)                                                       AS pct_chief_complaint,
        (SELECT COUNT(*) FROM #silver_attendance WHERE departure_dttm < arrival_dttm)     AS n_dep_before_arr,
        (SELECT COUNT(*) FROM #silver_attendance_diagnosis AS d
           WHERE NOT EXISTS (SELECT 1 FROM #silver_attendance AS a WHERE a.attendance_id = d.attendance_id)) AS n_orphan_diag
)
INSERT #dq_test_result (run_id, run_dttm, test_name, measured, threshold, rule_text, passed)
SELECT @run, @now, t.test_name, t.measured, t.threshold, t.rule_text,
       CASE t.op WHEN '>=' THEN IIF(t.measured >= t.threshold, 1, 0)
                 WHEN '<=' THEN IIF(t.measured <= t.threshold, 1, 0) END
FROM m
CROSS APPLY (VALUES
    ('silver_one_row_per_episode',  ABS(m.silver_rows - m.source_distinct_episodes), 0, '<=', 'silver rows = distinct episodes in dbo.ED_sandpit'),
    ('nhs_number_valid_pct',        m.pct_nhs_valid,                       95, '>=', 'valid NHS numbers >= 95%'),
    ('ethnicity_known_pct',         m.pct_ethnicity_known,                 90, '>=', 'known ethnicity >= 90%'),
    ('chief_complaint_coded_pct',   m.pct_chief_complaint,                 95, '>=', 'chief complaint coded >= 95%'),
    ('departure_before_arrival',    m.n_dep_before_arr,                    0,  '<=', 'no departure before arrival'),
    ('orphan_diagnoses',            m.n_orphan_diag,                       0,  '<=', 'every diagnosis has an attendance')
) AS t (test_name, measured, threshold, op, rule_text);

SELECT test_name, measured, threshold, rule_text, passed
FROM #dq_test_result WHERE run_id = @run ORDER BY passed, test_name;

IF @fail_on_error = 1 AND EXISTS (SELECT 1 FROM #dq_test_result WHERE run_id = @run AND passed = 0)
    THROW 50001, 'One or more data-quality tests failed. Read #dq_test_result.', 1;
GO

SET NOEXEC OFF;   -- always runs: switches normal execution back on
GO
