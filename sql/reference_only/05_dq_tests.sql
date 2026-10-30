/* READ ONLY - PRODUCTION VERSION.
   This script creates permanent objects (schemas, tables, functions, procedures, views).
   It needs permissions that a normal analyst login does not have.
   Do NOT run it unless your DBA gives you those permissions. Read it to learn how a
   real warehouse is built. See sql/reference_only/README.md.
   The course itself uses the temp-table scripts in the sql/ folder.            */

/* =====================================================================
   05_dq_tests.sql  -  data-quality tests: the verifier in your loop
   Each test returns a number. A rule says pass or fail.
   ===================================================================== */

DROP TABLE IF EXISTS dq.test_result;
CREATE TABLE dq.test_result (
    run_id       UNIQUEIDENTIFIER NOT NULL,
    run_dttm     DATETIME2(0)     NOT NULL,
    test_name    VARCHAR(100)     NOT NULL,
    measured     DECIMAL(18,2)    NULL,
    threshold    DECIMAL(18,2)    NOT NULL,
    rule_text    VARCHAR(200)     NOT NULL,
    passed       BIT              NOT NULL
);
GO

CREATE OR ALTER PROCEDURE dq.usp_run_tests
    @fail_on_error BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @run UNIQUEIDENTIFIER = NEWID(), @now DATETIME2(0) = SYSUTCDATETIME();

    WITH m AS (
        SELECT
            (SELECT COUNT(*) FROM silver.attendance)                                         AS silver_rows,
            (SELECT COUNT(DISTINCT AE_Episode_Number) FROM dbo.ED_sandpit)                  AS source_distinct_episodes,
            (SELECT 100.0 * AVG(CASE WHEN nhs_status = 'Valid' THEN 1.0 ELSE 0 END) FROM silver.attendance) AS pct_nhs_valid,
            (SELECT 100.0 * AVG(CASE WHEN ethnic_code IS NOT NULL AND ethnic_code NOT IN ('Z','99') THEN 1.0 ELSE 0 END)
               FROM silver.attendance)                                                       AS pct_ethnicity_known,
            (SELECT 100.0 * AVG(CASE WHEN chief_complaint_snomed IS NOT NULL THEN 1.0 ELSE 0 END)
               FROM silver.attendance)                                                       AS pct_chief_complaint,
            (SELECT COUNT(*) FROM silver.attendance WHERE departure_dttm < arrival_dttm)     AS n_dep_before_arr,
            (SELECT COUNT(*) FROM silver.attendance_diagnosis AS d
               WHERE NOT EXISTS (SELECT 1 FROM silver.attendance AS a WHERE a.attendance_id = d.attendance_id)) AS n_orphan_diag
    )
    INSERT dq.test_result (run_id, run_dttm, test_name, measured, threshold, rule_text, passed)
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
    FROM dq.test_result WHERE run_id = @run ORDER BY passed, test_name;

    IF @fail_on_error = 1 AND EXISTS (SELECT 1 FROM dq.test_result WHERE run_id = @run AND passed = 0)
        THROW 50001, 'One or more data-quality tests failed. Read dq.test_result.', 1;
END;
GO

EXEC dq.usp_run_tests @fail_on_error = 0;
GO
