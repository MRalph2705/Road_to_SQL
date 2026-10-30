/* ED SQL - lesson content for dbo.ED_sandpit (20,000 rows, 264 columns).
   Writing rule: every "ste" and "steps" line follows ASD-STE100 Simplified Technical English.
   Every drill has an "ans" computed from the full ED_sandpit extract (Oct 2025 - Oct 2026).
   ans: number, or text. tol: allowed difference for numbers. accept: other text forms. */

const yt = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);

window.LESSONS = [
/* ------------------------------------------------------------------ 1 */
{
  id: "profile", title: "Profile the raw table", stage: "Bronze", needs: [],
  nhs: "Data quality teams check completeness before any report goes out. NHS England publishes provider-level ECDS completeness, and providers that fail a check are left out of tables.",
  diagram: { type: "flow", nodes: ["dbo.ED_sandpit", "Count rows", "Fill % per column", "Top values", "Profile note"],
    caption: "Look before you clean. A profile is a map of the problems." },
  ponder: {
    q: "AE_ID has 20,000 distinct values. AE_Episode_Number has 19,945. Which number is the count of attendances?",
    a: "19,945. AE_ID is a row ID that the source system makes. AE_Episode_Number is the attendance. 55 episodes were sent two times with a new AE_ID. A unique ID does not prove unique events." },
  ste: [
    "A profile is a set of counts about a table.",
    "The profile shows the size of the table, the empty values and the most frequent values.",
    "Do the profile first. Do not change data during the profile.",
    "Count rows for each key column. Two keys can give two different answers.",
    "Your database is probably case-insensitive. Then 'm' = 'M' in a comparison."
  ],
  steps: [
    "Count the rows in the table.",
    "Count the distinct values of each key column.",
    "Calculate the percentage of filled values for each important column.",
    "List the most frequent values for each code column.",
    "Write the problems in a profile note."
  ],
  sql: `-- Completeness of key columns (one row per column).
-- CROSS APPLY VALUES turns columns into rows, so one query checks many columns.
-- Each value is 1 (filled) or 0 (NULL), so columns of different types work together.
SELECT
    c.column_name,
    COUNT(*)                                           AS total_rows,
    COUNT(*) - SUM(c.is_filled)                        AS missing_rows,
    CAST(100.0 * SUM(c.is_filled) / COUNT(*) AS DECIMAL(5,1)) AS pct_complete
FROM dbo.ED_sandpit AS r
CROSS APPLY (VALUES
    ('NHSNo',                IIF(r.NHSNo IS NULL, 0, 1)),
    ('Eth_Group_Code',       IIF(r.Eth_Group_Code IS NULL, 0, 1)),
    ('Seen_DTTM',            IIF(r.Seen_DTTM IS NULL, 0, 1)),
    ('Departed_DTTM',        IIF(r.Departed_DTTM IS NULL, 0, 1)),
    ('Triage_Category',      IIF(r.Triage_Category IS NULL, 0, 1)),
    ('Diag1',                IIF(r.Diag1 IS NULL, 0, 1)),
    ('Blood_Pressure',       IIF(r.Blood_Pressure IS NULL, 0, 1)),
    ('Weight_Kg',            IIF(r.Weight_Kg IS NULL, 0, 1))
) AS c (column_name, is_filled)
GROUP BY c.column_name
ORDER BY pct_complete;`,
  pitfalls: [
    "COUNT(column) does not count NULL. COUNT(*) counts every row.",
    "Do not use SELECT * on 264 columns to 'look'. Select the columns you need."
  ],
  video: { title: "SQL Server data profiling queries", who: "Search: data profiling in T-SQL", url: yt("data profiling SQL Server T-SQL") },
  drills: [
    { id: "p1", q: "How many AE_Episode_Number values appear more than once in dbo.ED_sandpit?", ans: 55,
      sql: `SELECT COUNT(*) AS repeated_episodes
FROM (SELECT AE_Episode_Number
      FROM dbo.ED_sandpit
      GROUP BY AE_Episode_Number
      HAVING COUNT(*) > 1) AS x;` },
    { id: "p2", q: "How many rows have a Sex value that is not exactly 'M' or 'F'? Use a case-sensitive comparison, and count NULL values too.", ans: 182,
      hint: "If you got 142, your comparison is case-insensitive, so 'm' and 'f' matched. Add COLLATE Latin1_General_CS_AS.",
      sql: `SELECT COUNT(*) AS non_standard_sex
FROM dbo.ED_sandpit
WHERE Sex IS NULL
   OR Sex COLLATE Latin1_General_CS_AS NOT IN ('M', 'F');` },
    { id: "p3", q: "What percentage of rows have no Eth_Group_Code (NULL)? Give your answer to 1 decimal place.", ans: 3.5, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * SUM(IIF(Eth_Group_Code IS NULL, 1, 0)) / COUNT(*) AS DECIMAL(5,1)) AS pct_missing
FROM dbo.ED_sandpit;` }
  ]
},
/* ------------------------------------------------------------------ 2 */
{
  id: "nulls", title: "NULLs and hidden NULLs", stage: "Bronze", needs: ["01"],
  nhs: "Completeness measures (ethnicity, NHS number, diagnosis) are wrong if you count a placeholder as a real value. 'Not stated', 'U' and 1900-01-01 look filled, but they carry no information.",
  diagram: { type: "grid", arrow: "treat as 'not known'",
    before: { cols: ["column", "value in ED_sandpit"], rows: [["DoB", "1900-01-01"], ["Sex", "U"], ["Eth_Group_Code", "Z / 99"], ["Weight_Kg", "0.0"], ["Seen_DTTM", "NULL"]] },
    after:  { cols: ["meaning"], rows: [["date of birth not known"], ["sex not known"], ["not stated / not known"], ["not weighed"], ["never seen (left)"]] },
    caption: "A real NULL is honest. A placeholder is a NULL in disguise." },
  ponder: {
    q: "Why does WHERE Eth_Group_Code NOT IN ('A', 'B', NULL) return zero rows?",
    a: "NOT IN compares each value with every item in the list. A comparison with NULL gives UNKNOWN, not TRUE. So no row passes. Use NOT EXISTS, or remove NULL from the list." },
  ste: [
    "NULL means 'no value'. NULL is not zero and not a blank.",
    "A comparison with NULL gives UNKNOWN. WHERE keeps a row only when the result is TRUE.",
    "A placeholder is a value that means 'not known', for example 1900-01-01.",
    "Count placeholders as missing in completeness measures.",
    "Not every NULL is an error. Seen_DTTM is NULL when the patient left before being seen."
  ],
  steps: [
    "Use IS NULL to find NULL. Do not use = NULL.",
    "Compare COUNT(*) and COUNT(column) to count NULLs.",
    "List the values that mean 'not known' for each column.",
    "Decide with the data owner how to report each one.",
    "Use COALESCE to give a default value only in the final report."
  ],
  sql: `-- Real NULLs and hidden NULLs side by side
SELECT
    COUNT(*)                                        AS all_rows,
    COUNT(*) - COUNT(Eth_Group_Code)                AS ethnicity_null,
    SUM(IIF(Eth_Group_Code IN ('Z', '99'), 1, 0))  AS ethnicity_not_stated_or_known,
    SUM(IIF(DoB = '19000101', 1, 0))                AS dob_placeholder,
    SUM(IIF(Weight_Kg = 0, 1, 0))                   AS weight_zero
FROM dbo.ED_sandpit;

-- Safe anti-join: NOT EXISTS is not affected by NULL
SELECT r.Eth_Group_Code, COUNT(*) AS n
FROM dbo.ED_sandpit AS r
WHERE NOT EXISTS (SELECT 1 FROM #ref_ethnic_category AS e
                  WHERE e.ethnic_code = r.Eth_Group_Code COLLATE DATABASE_DEFAULT)
GROUP BY r.Eth_Group_Code;   -- needs #ref_ethnic_category: run sql/01_reference.sql in this window first`,
  pitfalls: [
    "ISNULL(x, '') hides missing data. Keep NULL in silver. Replace it only in the report.",
    "ISNULL takes the data type of the first argument. COALESCE takes the highest type. Prefer COALESCE."
  ],
  video: { title: "NULL functions: COALESCE, ISNULL, NULLIF", who: "Data with Baraa (SQL Full Course)", url: yt("Data with Baraa SQL NULL functions COALESCE NULLIF") },
  drills: [
    { id: "n1", q: "How many attendances have no Seen_DTTM? Use COUNT(*) and COUNT(column) to find out.", ans: 394,
      sql: `SELECT COUNT(*) - COUNT(Seen_DTTM) AS never_seen FROM dbo.ED_sandpit;` },
    { id: "n2", q: "How many rows have an unknown ethnicity? Count NULL, 'Z' (not stated) and '99' (not known).", ans: 1875,
      sql: `SELECT COUNT(*) AS ethnicity_unknown
FROM dbo.ED_sandpit
WHERE Eth_Group_Code IS NULL OR Eth_Group_Code IN ('Z', '99');` },
    { id: "n3", q: "How many rows have the placeholder date of birth 1900-01-01?", ans: 18,
      sql: `SELECT COUNT(*) AS dob_placeholder FROM dbo.ED_sandpit WHERE DoB = '19000101';` },
    { id: "n4", q: "How many rows have no Departed_DTTM? Then look at their arrival times: are these rows errors?", ans: 9,
      hint: "They all arrived on 11 October 2026, the last day of the extract. These patients were still in the department.",
      sql: `SELECT COUNT(*) AS no_departure
FROM dbo.ED_sandpit
WHERE Departed_DTTM IS NULL;

-- Then look at the arrival times of those rows:
-- SELECT MIN(Arrived_DTTM) AS first_arrival, MAX(Arrived_DTTM) AS last_arrival
-- FROM dbo.ED_sandpit
-- WHERE Departed_DTTM IS NULL;` }
  ]
},
/* ------------------------------------------------------------------ 3 */
{
  id: "types", title: "Text to dates and numbers", stage: "Bronze → Silver", needs: [],
  nhs: "Every waiting-time measure is a date calculation. Many extracts still hold dates, blood pressures and scores as text. One wrong conversion can move hundreds of patients across a target.",
  diagram: { type: "grid", arrow: "pattern test, then TRY_CONVERT",
    before: { cols: ["text in ED_sandpit"], rows: [["census_date '11/10/2026'"], ["Blood_Pressure '147 / 93'"], ["Blood_Pressure '133\\80'"], ["Temperature 98.6"]] },
    after:  { cols: ["clean value"], rows: [["DATE 2026-10-11"], ["147 and 93"], ["133 and 80"], ["37.0 °C"]] },
    caption: "Test the pattern first. Then convert with the rule that matches." },
  ponder: {
    q: "MAX(census_date) returns '31/12/2025', but the extract runs to October 2026. Why?",
    a: "census_date is VARCHAR in dd/mm/yyyy format. Text sorts character by character: '31/12/2025' is 'bigger' than '11/10/2026' because '3' > '1'. Convert to DATE first: CONVERT(DATE, census_date, 103)." },
  ste: [
    "A text column sorts as text, not as a date or a number.",
    "CONVERT stops the query when a value is bad. TRY_CONVERT gives NULL when a value is bad. The queries here use TRY_CONVERT.",
    "Always give the style number for a date. Style 103 means dd/mm/yyyy.",
    "Normalise text before you split it: remove spaces and use one separator.",
    "A value in the wrong unit is a type problem too. 98.6 is Fahrenheit, not Celsius."
  ],
  steps: [
    "Find the patterns in the column with LIKE.",
    "Convert each pattern with its own rule.",
    "Count the values that match no pattern.",
    "Check that numbers are in a plausible range.",
    "Store the result in the correct data type in silver."
  ],
  sql: `-- 1. Text date -> real date
SELECT MAX(census_date)                           AS max_as_text,     -- wrong
       MAX(TRY_CONVERT(DATE, census_date, 103))   AS max_as_date      -- right
FROM dbo.ED_sandpit;

-- 2. Blood pressure: normalise separators, then split
SELECT Blood_Pressure, bp,
       TRY_CONVERT(SMALLINT, LEFT(bp, NULLIF(CHARINDEX('/', bp), 0) - 1)) AS systolic,
       TRY_CONVERT(SMALLINT, SUBSTRING(bp, CHARINDEX('/', bp) + 1, 3))  AS diastolic
FROM dbo.ED_sandpit
CROSS APPLY (SELECT REPLACE(REPLACE(REPLACE(Blood_Pressure, ' ', ''), '\\', '/'), '-', '/') AS bp) AS x
WHERE bp LIKE '[0-9]%/[0-9]%';

-- 3. Temperature in Fahrenheit -> Celsius
SELECT Temperature,
       CAST(ROUND((Temperature - 32) * 5 / 9.0, 1) AS DECIMAL(4,1)) AS temperature_c
FROM dbo.ED_sandpit
WHERE Temperature > 45;`,
  pitfalls: [
    "FORMAT() is slow on large tables. Use CONVERT with a style.",
    "TRY_CONVERT never fails, so it can hide bad data. Always count the new NULLs it makes."
  ],
  video: { title: "Date and time functions in SQL Server", who: "Data with Baraa (SQL Full Course)", url: yt("Data with Baraa SQL date time functions CONVERT CAST") },
  drills: [
    { id: "t1", q: "What does MAX(census_date) return if you leave the column as text? Type the value exactly as SQL Server shows it.", ans: "31/12/2025", fmt: "dd/mm/yyyy",
      sql: `SELECT MAX(census_date) AS max_as_text FROM dbo.ED_sandpit;` },
    { id: "t2", q: "Convert census_date to a DATE. What is the latest census date? Type it as yyyy-mm-dd.", ans: "2026-10-11", fmt: "yyyy-mm-dd", accept: ["11/10/2026"],
      sql: `SELECT MAX(TRY_CONVERT(DATE, census_date, 103)) AS max_as_date FROM dbo.ED_sandpit;` },
    { id: "t3", q: "How many Temperature values look like Fahrenheit (greater than 45)?", ans: 25,
      sql: `SELECT COUNT(*) AS fahrenheit_rows FROM dbo.ED_sandpit WHERE Temperature > 45;` },
    { id: "t4", q: "Remove the spaces from each filled Blood_Pressure value. How many values still do not match the pattern '[0-9]%/[0-9]%'?", ans: 153,
      sql: `SELECT COUNT(*) AS bp_bad
FROM dbo.ED_sandpit
WHERE Blood_Pressure IS NOT NULL
  AND REPLACE(Blood_Pressure, ' ', '') NOT LIKE '[0-9]%/[0-9]%';` },
    { id: "t5", q: "Now also change '\\' and '-' to '/'. How many filled values still do not match the pattern?", ans: 81,
      hint: "The values that are left are 'refused' and values with no second number, for example '144/'.",
      sql: `SELECT COUNT(*) AS bp_still_bad
FROM dbo.ED_sandpit
WHERE Blood_Pressure IS NOT NULL
  AND REPLACE(REPLACE(REPLACE(Blood_Pressure, ' ', ''), '\\', '/'), '-', '/') NOT LIKE '[0-9]%/[0-9]%';` }
  ]
},
/* ------------------------------------------------------------------ 4 */
{
  id: "nhsno", title: "Validate NHS numbers (Modulus 11)", stage: "Silver", needs: ["01","02"],
  nhs: "The NHS number links a patient across every dataset. Linkage, reattendance and pseudonymisation all fail when the NHS number is wrong. Validation is a standard request.",
  diagram: { type: "flow", nodes: ["9 digits × weights 10…2", "Add the results", "Sum mod 11", "11 − remainder", "11→0, 10→invalid", "= digit 10?"],
    caption: "999 135 679 7: 9×10 + 9×9 + 9×8 + 1×7 + 3×6 + 5×5 + 6×4 + 7×3 + 9×2 = 356. 356 mod 11 = 4. 11 − 4 = 7. Check digit is 7. Valid." },
  ponder: {
    q: "Why can a check digit of 10 never be valid?",
    a: "The check digit is one digit. 10 has two digits. So the NHS does not issue any number that gives 10. If your calculation gives 10, the number is invalid." },
  ste: [
    "An NHS number has 10 digits.",
    "Digit 10 is a check digit. It comes from digits 1 to 9.",
    "The check finds most typing errors, for example one wrong digit.",
    "Numbers that start with 999 are test numbers. ED_sandpit uses them.",
    "Calculate the check in one place. Then every load uses the same rule.",
    "Here, sql/02_silver.sql stores the result in #etl_nhs_check. Production uses an inline function."
  ],
  steps: [
    "Remove spaces and hyphens.",
    "Confirm that the value has exactly 10 digits.",
    "Multiply digits 1 to 9 by the weights 10 to 2.",
    "Add the 9 results.",
    "Calculate 11 minus (the sum modulo 11).",
    "Change 11 to 0. Mark 10 as invalid.",
    "Compare the result with digit 10."
  ],
  sql: `-- The Modulus 11 rule as a plain query. It reads dbo.ED_sandpit only.
-- Each CROSS APPLY does one step: clean, calculate, decide.
SELECT c.nhs_status, COUNT(*) AS n
FROM dbo.ED_sandpit AS r
-- To test one value by hand, change the line above to:
-- FROM (VALUES ('9991356797')) AS r (NHSNo)        -- expect Valid
CROSS APPLY (SELECT REPLACE(REPLACE(LTRIM(RTRIM(r.NHSNo)), ' ', ''), '-', '') AS nhs) AS x
CROSS APPLY (
    SELECT CASE WHEN x.nhs LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN
               11 - ( ( CAST(SUBSTRING(x.nhs,1,1) AS INT) * 10 + CAST(SUBSTRING(x.nhs,2,1) AS INT) * 9
                      + CAST(SUBSTRING(x.nhs,3,1) AS INT) * 8  + CAST(SUBSTRING(x.nhs,4,1) AS INT) * 7
                      + CAST(SUBSTRING(x.nhs,5,1) AS INT) * 6  + CAST(SUBSTRING(x.nhs,6,1) AS INT) * 5
                      + CAST(SUBSTRING(x.nhs,7,1) AS INT) * 4  + CAST(SUBSTRING(x.nhs,8,1) AS INT) * 3
                      + CAST(SUBSTRING(x.nhs,9,1) AS INT) * 2 ) % 11 )
           END AS check_calc
) AS k
CROSS APPLY (
    SELECT CASE WHEN x.nhs IS NULL OR x.nhs = ''   THEN 'Missing'
                WHEN k.check_calc IS NULL          THEN 'Bad format'
                WHEN k.check_calc = 10             THEN 'Invalid'
                WHEN CASE WHEN k.check_calc = 11 THEN 0 ELSE k.check_calc END
                     = CAST(RIGHT(x.nhs, 1) AS INT) THEN 'Valid'
                ELSE 'Checksum fail' END AS nhs_status
) AS c
GROUP BY c.nhs_status
ORDER BY n DESC;

-- sql/02_silver.sql stores the same result for every row in #etl_nhs_check:
SELECT nhs_status, COUNT(*) AS n FROM #etl_nhs_check GROUP BY nhs_status ORDER BY n DESC;`,
  pitfalls: [
    "A scalar function runs once per row on SQL Server 2017. An inline table-valued function is set-based.",
    "A valid checksum does not prove the number belongs to this patient. Use PDS tracing for that."
  ],
  video: { title: "NHS number check digit (Modulus 11) explained", who: "Search: NHS number modulus 11", url: yt("NHS number modulus 11 check digit") },
  drills: [
    { id: "v1", q: "How many rows have an NHS number that fails the Modulus 11 checksum?", ans: 44,
      sql: `SELECT COUNT(*) AS checksum_fail
FROM #etl_nhs_check            -- one row per row of dbo.ED_sandpit
WHERE nhs_status = 'Checksum fail';` },
    { id: "v2", q: "How many distinct valid NHS numbers (patients) are there?", ans: 12357,
      sql: `SELECT COUNT(DISTINCT nhs_number) AS valid_patients
FROM #etl_nhs_check
WHERE nhs_status = 'Valid';` },
    { id: "v3", q: "How many rows have no NHS number at all (NULL)?", ans: 188,
      sql: `SELECT COUNT(*) AS nhs_missing FROM dbo.ED_sandpit WHERE NHSNo IS NULL;` }
  ]
},
/* ------------------------------------------------------------------ 5 */
{
  id: "dupes", title: "Find and remove duplicates", stage: "Silver", needs: [],
  nhs: "Duplicate attendances inflate activity and payment. Contracting and SUS reconciliation teams ask for counts that match the provider's own system.",
  diagram: { type: "grid", arrow: "ROW_NUMBER() … WHERE rn = 1",
    before: { cols: ["AE_ID", "AE_Episode_Number", "Modif_DTTM", "rn"], rows: [["588", "ED25-000588", "13 Oct 19:28", "2"], ["589", "ED25-000588", "13 Oct 21:39", "1"], ["590", "ED25-000590", "13 Oct 18:02", "1"]] },
    after:  { cols: ["AE_ID", "AE_Episode_Number"], rows: [["589", "ED25-000588"], ["590", "ED25-000590"]] },
    caption: "Partition by the business key. Keep the newest version (rn = 1)." },
  ponder: {
    q: "AE_ID 588 and 589 have the same episode, patient and arrival time, to the second. Only Modif_DTTM differs. Which row do you keep?",
    a: "Keep the row with the latest Modif_DTTM. It is the most recent version of the record. Add AE_ID as a tie-breaker so the choice is the same every run." },
  ste: [
    "An exact duplicate has the same key as another row.",
    "A near duplicate has a different row ID but describes the same event.",
    "ROW_NUMBER gives a number to each row in a group.",
    "PARTITION BY sets the group. ORDER BY sets which row is number 1.",
    "Keep row number 1. Do not use DISTINCT on all columns to remove duplicates."
  ],
  steps: [
    "Decide the key that makes a row unique: AE_Episode_Number.",
    "Put ROW_NUMBER in a CTE.",
    "Partition by the key.",
    "Order by Modif_DTTM, newest first, then by AE_ID.",
    "Keep only rows where the number is 1.",
    "Count the removed rows and record the count."
  ],
  sql: `WITH ranked AS (
    SELECT AE_ID, AE_Episode_Number, NHSNo, Arrived_DTTM, Modif_DTTM,
           ROW_NUMBER() OVER (PARTITION BY AE_Episode_Number
                              ORDER BY Modif_DTTM DESC, AE_ID DESC) AS rn
    FROM dbo.ED_sandpit
)
SELECT AE_ID, AE_Episode_Number, NHSNo, Arrived_DTTM, Modif_DTTM, rn
FROM ranked
WHERE AE_Episode_Number IN (SELECT AE_Episode_Number FROM ranked WHERE rn > 1)
ORDER BY AE_Episode_Number, rn;`,
  pitfalls: [
    "DELETE from a CTE removes rows from the base table. Never do this to dbo.ED_sandpit.",
    "Without a tie-breaker in ORDER BY, the kept row can change between runs."
  ],
  video: { title: "SQL window functions: ROW_NUMBER", who: "Data with Baraa (SQL Full Course)", url: yt("Data with Baraa SQL window functions ROW_NUMBER duplicates") },
  drills: [
    { id: "d1", q: "How many rows are left after you keep one row for each AE_Episode_Number?", ans: 19945,
      sql: `WITH ranked AS (
    SELECT ROW_NUMBER() OVER (PARTITION BY AE_Episode_Number ORDER BY Modif_DTTM DESC, AE_ID DESC) AS rn
    FROM dbo.ED_sandpit
)
SELECT COUNT(*) AS rows_kept FROM ranked WHERE rn = 1;` },
    { id: "d2", q: "Each duplicate pair shares an AE_Episode_Number. Apart from AE_ID, which column has a different value in every pair? Prove it with a query, then type the column name.", ans: "Modif_DTTM", fmt: "a column name", accept: ["modif dttm","modif_dttm","modifdttm"],
      sql: `-- Join each duplicate row to its partner, then test candidate columns.
-- EXISTS (SELECT a.x EXCEPT SELECT b.x) is 1 when the two values differ. It treats NULL = NULL as the same.
-- The query returns the columns that differ in EVERY pair.
SELECT c.column_name
FROM dbo.ED_sandpit AS a
JOIN dbo.ED_sandpit AS b
  ON b.AE_Episode_Number = a.AE_Episode_Number
 AND b.AE_ID > a.AE_ID                      -- one row per pair
CROSS APPLY (VALUES
    ('NHSNo',          CASE WHEN EXISTS (SELECT a.NHSNo          EXCEPT SELECT b.NHSNo)          THEN 1 ELSE 0 END),
    ('Arrived_DTTM',   CASE WHEN EXISTS (SELECT a.Arrived_DTTM   EXCEPT SELECT b.Arrived_DTTM)   THEN 1 ELSE 0 END),
    ('Seen_DTTM',      CASE WHEN EXISTS (SELECT a.Seen_DTTM      EXCEPT SELECT b.Seen_DTTM)      THEN 1 ELSE 0 END),
    ('Departed_DTTM',  CASE WHEN EXISTS (SELECT a.Departed_DTTM  EXCEPT SELECT b.Departed_DTTM)  THEN 1 ELSE 0 END),
    ('Eth_Group_Code', CASE WHEN EXISTS (SELECT a.Eth_Group_Code EXCEPT SELECT b.Eth_Group_Code) THEN 1 ELSE 0 END),
    ('Diag1',          CASE WHEN EXISTS (SELECT a.Diag1          EXCEPT SELECT b.Diag1)          THEN 1 ELSE 0 END),
    ('Modif_DTTM',     CASE WHEN EXISTS (SELECT a.Modif_DTTM     EXCEPT SELECT b.Modif_DTTM)     THEN 1 ELSE 0 END)
) AS c (column_name, is_different)
GROUP BY c.column_name
HAVING SUM(c.is_different) = COUNT(*);` }
  ]
},
/* ------------------------------------------------------------------ 6 */
{
  id: "medallion", title: "Build silver: the load script", stage: "Silver", needs: ["01","02"],
  nhs: "Trust data warehouses run nightly loads. A data engineer owns the code that turns the PAS / EPR extract into trusted tables, with a log that shows each run.",
  diagram: { type: "layers", layers: [
      { name: "Bronze: dbo.ED_sandpit", text: "Raw extract. 264 columns. As received. Never edited.", tone: "bronze" },
      { name: "Silver", text: "Cleaned, validated, de-duplicated. One row per episode. DQ flags.", tone: "silver" },
      { name: "Gold",   text: "Star schema and measures. Pseudonymised. Ready for Power BI.", tone: "gold" }],
    caption: "Each layer has one job. Each move between layers is one procedure." },
  ponder: {
    q: "Why keep dbo.ED_sandpit unchanged when silver already has the clean data?",
    a: "The raw table is your evidence. When a number looks wrong, you trace it back to the raw row. If you clean in place, you cannot prove what the source sent. You also cannot re-run a fixed rule." },
  ste: [
    "In production, the load is a stored procedure: saved SQL that you run by name.",
    "Here, the load is a script: sql/02_silver.sql. It has the same parts.",
    "The load reads dbo.ED_sandpit, cleans the data and writes #silver_attendance.",
    "TRY and CATCH stop a failed load from writing half the data.",
    "The load writes a row to a log table for each run.",
    "The dq_flags column records each problem. The load does not delete problem rows."
  ],
  steps: [
    "Open one query window on the database that holds dbo.ED_sandpit.",
    "Run sql/01_reference.sql to create the lookup tables.",
    "Run sql/02_silver.sql in the same window. It creates the tables and runs the load.",
    "Read #etl_load_log. Compare rows_read with rows_written.",
    "Count the problems in dq_flags."
  ],
  sql: `-- Run sql/01_reference.sql and sql/02_silver.sql in this window first.
SELECT TOP (5) process_name, started_dttm, ended_dttm, rows_read, rows_written, status, error_message
FROM #etl_load_log
ORDER BY log_id DESC;

-- Which problems did the load find? One row for each flag name.
-- Commas around both sides stop 'NHS_INVALID' from matching inside a longer flag.
-- (STRING_SPLIT also works, but it needs database compatibility level 130 or higher.)
SELECT f.dq_flag, COUNT(a.attendance_id) AS n
FROM (VALUES ('NHS_MISSING'), ('NHS_BAD_FORMAT'), ('NHS_INVALID'), ('NHS_CHECKSUM_FAIL'),
             ('DOB_PLACEHOLDER'), ('STILL_IN_DEPARTMENT'), ('DEPARTURE_BEFORE_ARRIVAL'),
             ('SEX_UNKNOWN'), ('POSTCODE_INVALID'), ('ETHNICITY_MISSING'),
             ('TRIAGE_MISSING'), ('BP_UNUSABLE')) AS f (dq_flag)
LEFT JOIN #silver_attendance AS a
       ON ',' + a.dq_flags + ',' LIKE '%,' + f.dq_flag + ',%'
GROUP BY f.dq_flag
ORDER BY n DESC;`,
  pitfalls: [
    "Always SET XACT_ABORT ON in a load. Then any error rolls back the transaction.",
    "Do not catch an error and then hide it. Log it, roll back, then THROW."
  ],
  video: { title: "SQL Data Warehouse project (bronze, silver, gold)", who: "Data with Baraa - free full project", url: yt("Data with Baraa SQL data warehouse project from scratch") },
  drills: [
    { id: "m1", q: "After the load, how many rows are in #silver_attendance?", ans: 19945,
      sql: `SELECT COUNT(*) AS silver_rows FROM #silver_attendance;` },
    { id: "m2", q: "How many rows in #silver_attendance have the flag DEPARTURE_BEFORE_ARRIVAL?", ans: 14,
      sql: `SELECT COUNT(*) AS n
FROM #silver_attendance
WHERE dq_flags LIKE '%DEPARTURE_BEFORE_ARRIVAL%';` },
    { id: "m3", q: "How many rows in #silver_attendance have the flag DOB_PLACEHOLDER?", ans: 18,
      sql: `SELECT COUNT(*) AS n FROM #silver_attendance WHERE dq_flags LIKE '%DOB_PLACEHOLDER%';` }
  ]
},
/* ------------------------------------------------------------------ 7 */
{
  id: "durations", title: "Waiting times: 4 hours and 12 hours", stage: "Silver", needs: ["01","02"],
  nhs: "The 4-hour standard (arrival to admission, transfer or discharge) is the headline A&E measure. 12 hours from arrival applies to Type 1 and Type 2. Time to initial assessment and time to treatment are ECDS quality indicators.",
  diagram: { type: "timeline", max: 13, scale: "sqrt",
    marks: [{ t: 0, label: "Arrival" }, { t: 0.25, label: "Triage ≤15m" }, { t: 1, label: "Seen ≤60m" }, { t: 4, label: "4h line" }, { t: 12, label: "12h line" }],
    caption: "All clocks start at arrival. The departure (clock stop) decides 4-hour and 12-hour status." },
  ponder: {
    q: "Arrival is 10:00:01 and departure is 14:00:59. DATEDIFF(MINUTE, …) returns 240, so a rule of '≤ 240 minutes' says the patient was inside 4 hours. Is that correct?",
    a: "No. The real stay is 4 hours 0 minutes 58 seconds. It is a breach. DATEDIFF(MINUTE) counts minute boundaries crossed (10:00 → 14:00 = 240), not elapsed time. Use DATEDIFF(SECOND) and compare with 14,400." },
  ste: [
    "DATEDIFF counts the boundaries that the interval crosses.",
    "DATEDIFF(HOUR) from 10:59 to 11:01 gives 1. The real time is 2 minutes.",
    "Use seconds for all waiting-time rules.",
    "4 hours is 14,400 seconds. 12 hours is 43,200 seconds.",
    "Exclude a row from a measure when the departure is missing or before arrival. Report the excluded count."
  ],
  steps: [
    "Calculate the seconds from arrival to departure.",
    "Set within_4h to 1 when the seconds are 14,400 or less.",
    "Set over_12h to 1 when the seconds are more than 43,200.",
    "Calculate minutes to triage and minutes to clinician.",
    "Count the rows that you excluded and why."
  ],
  sql: `SELECT
    a.attendance_id,
    a.dept_type,
    t.secs_in_dept,
    IIF(t.secs_in_dept <= 14400, 1, 0)                     AS within_4h,
    IIF(t.secs_in_dept >  43200, 1, 0)                     AS over_12h_from_arrival,
    DATEDIFF(MINUTE, a.arrival_dttm, a.triage_dttm)        AS mins_to_initial_assessment,
    DATEDIFF(MINUTE, a.arrival_dttm, a.seen_dttm)          AS mins_to_clinician
FROM #silver_attendance AS a
CROSS APPLY (SELECT DATEDIFF(SECOND, a.arrival_dttm, a.departure_dttm) AS secs_in_dept) AS t
WHERE a.departure_dttm >= a.arrival_dttm;        -- excludes NULL and negative durations`,
  pitfalls: [
    "Check every time against arrival: in ED_sandpit, 14 departures are before arrival and before the seen time.",
    "Some trusts use a local clock-stop column. Agree the rule with the performance team in writing."
  ],
  video: { title: "DATEDIFF and date arithmetic in SQL Server", who: "Search: DATEDIFF boundary behaviour", url: yt("SQL Server DATEDIFF explained boundaries") },
  drills: [
    { id: "w1", q: "In dbo.ED_sandpit, how many rows have a Departed_DTTM that is earlier than Arrived_DTTM?", ans: 14,
      sql: `SELECT COUNT(*) AS dep_before_arr FROM dbo.ED_sandpit WHERE Departed_DTTM < Arrived_DTTM;` },
    { id: "w2", q: "For Type 1 attendances in #silver_attendance, what is the median time in minutes from arrival to being seen by a clinician? Use PERCENTILE_CONT and DATEDIFF(MINUTE, ...).", ans: 61, tol: 0.05, unit: "min",
      sql: `SELECT DISTINCT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY DATEDIFF(MINUTE, arrival_dttm, seen_dttm)) OVER () AS median_mins_to_clinician
FROM #silver_attendance
WHERE dept_type = 1 AND seen_dttm >= arrival_dttm;` },
    { id: "w3", q: "How many Type 1 attendances in #silver_attendance stayed in the department for more than 12 hours from arrival?", ans: 606,
      sql: `SELECT COUNT(*) AS over_12h_type1
FROM #silver_attendance
WHERE dept_type = 1
  AND DATEDIFF(SECOND, arrival_dttm, departure_dttm) > 43200;` },
    { id: "w4", q: "How many attendances of any type stayed in the department for more than 24 hours?", ans: 97,
      sql: `SELECT COUNT(*) AS over_24h
FROM #silver_attendance
WHERE DATEDIFF(SECOND, arrival_dttm, departure_dttm) > 86400;` }
  ]
},
/* ------------------------------------------------------------------ 8 */
{
  id: "aggregate", title: "Monthly performance (SitRep style)", stage: "Gold", needs: ["01","02"],
  nhs: "The monthly A&E return gives attendances and 4-hour performance by type. Operational plans set the target (82% for 2026/27). Boards want the same table every month.",
  diagram: { type: "flow", nodes: ["Rows", "GROUP BY month, type", "SUM(CASE …) / COUNT", "% within 4h", "GROUPING SETS → All types"],
    caption: "Conditional aggregation: one pass, many measures." },
  ponder: {
    q: "Type 1 performance is 66%, and Type 3 is much higher. Is the 'all types' figure the average of the two percentages?",
    a: "No. The all-types figure is total within 4h divided by total attendances. Type 1 has far more attendances, so it pulls the result down. Never average percentages. Add the counts, then divide." },
  ste: [
    "GROUP BY puts rows into groups. An aggregate gives one value for each group.",
    "SUM(CASE WHEN … THEN 1 ELSE 0 END) counts the rows that meet a rule.",
    "Divide by 100.0, not 100. Integer division removes the decimals.",
    "GROUPING SETS gives the detail rows and the total rows in one query.",
    "GROUPING(column) is 1 on a total row. Use it to label the total row. A NULL in the data is not a total.",
    "Check that the last month is complete before you compare months."
  ],
  steps: [
    "Start from silver or gold, not from the raw table.",
    "Group by month and department type.",
    "Count attendances and count rows within 4 hours.",
    "Divide to get the percentage.",
    "Add a total row with GROUPING SETS.",
    "Compare each month with the target."
  ],
  sql: `DECLARE @target DECIMAL(5,1) = 82.0;   -- 2026/27 planning target (check your local plan)

WITH a AS (
    SELECT DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1) AS month_start,
           dept_type,
           IIF(DATEDIFF(SECOND, arrival_dttm, departure_dttm) <= 14400, 1, 0) AS within_4h
    FROM #silver_attendance
    WHERE departure_dttm >= arrival_dttm
)
SELECT
    month_start,
    IIF(GROUPING(dept_type) = 1, 'All types',
        COALESCE(CAST(dept_type AS VARCHAR(10)), 'Unknown'))         AS dept_type_label,
    COUNT(*)                                                         AS attendances,
    SUM(within_4h)                                                   AS within_4h,
    CAST(100.0 * SUM(within_4h) / COUNT(*) AS DECIMAL(5,1))          AS pct_4h,
    IIF(100.0 * SUM(within_4h) / COUNT(*) >= @target, 'Met', 'Not met') AS vs_target,
    GROUPING(dept_type)                                              AS is_total_row
FROM a
GROUP BY GROUPING SETS ((month_start, dept_type), (month_start))
ORDER BY month_start, is_total_row, dept_type_label;`,
  pitfalls: [
    "October 2026 is a partial month (the extract ends on 11 October). Mark it or leave it out of trends.",
    "Group on the month start date, not on MONTH(). MONTH() mixes October 2025 with October 2026."
  ],
  video: { title: "GROUP BY, CASE WHEN and conditional aggregation", who: "Data with Baraa (SQL Full Course)", url: yt("SQL conditional aggregation SUM CASE WHEN GROUP BY") },
  drills: [
    { id: "a1", q: "What is the 4-hour performance for Type 1 attendances across the whole extract? Use #silver_attendance, leave out rows with a missing or negative duration, and give 1 decimal place.", ans: 66.3, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * SUM(IIF(DATEDIFF(SECOND, arrival_dttm, departure_dttm) <= 14400, 1, 0)) / COUNT(*) AS DECIMAL(5,1)) AS pct_4h_type1
FROM #silver_attendance
WHERE dept_type = 1 AND departure_dttm >= arrival_dttm;` },
    { id: "a2", q: "Which month had the most attendances? Type it as yyyy-mm.", ans: "2025-12", fmt: "yyyy-mm", accept: ["dec 2025","december 2025","12/2025","2025-12-01"],
      sql: `SELECT TOP (1)
       CONVERT(CHAR(7), DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1), 126) AS busiest_month   -- style 126 gives yyyy-mm-dd; CHAR(7) keeps yyyy-mm
FROM #silver_attendance
GROUP BY DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1)
ORDER BY COUNT(*) DESC;` },
    { id: "a3", q: "What is the 4-hour performance for children under 16 (all department types)? Give 1 decimal place. The national ambition is 95%.", ans: 76.1, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * SUM(IIF(DATEDIFF(SECOND, arrival_dttm, departure_dttm) <= 14400, 1, 0)) / COUNT(*) AS DECIMAL(5,1)) AS pct_4h_under16
FROM #silver_attendance
WHERE age_at_arrival < 16 AND departure_dttm >= arrival_dttm;` },
    { id: "a4", q: "How many attendances arrived in October 2026? Compare this with a normal month. What does it mean for a monthly trend chart?", ans: 591,
      hint: "A normal month has about 1,500 to 1,800 attendances. The extract stops on 11 October 2026, so October is a partial month.",
      sql: `SELECT COUNT(*) AS oct_2026
FROM #silver_attendance
WHERE arrival_dttm >= '20261001' AND arrival_dttm < '20261101';` }
  ]
},
/* ------------------------------------------------------------------ 9 */
{
  id: "joins", title: "Joins and reference data", stage: "Silver → Gold", needs: ["01","02"],
  nhs: "Codes mean nothing without lookups: ethnic category, disposal, SNOMED discharge destination, GP practice to sub-ICB. Unmatched codes are a frequent data-quality question.",
  diagram: { type: "venn", left: "#silver_attendance", right: "#ref_attendance_disposal", highlight: "leftonly",
    caption: "LEFT JOIN … WHERE right.key IS NULL finds the codes with no lookup (orphans)." },
  ponder: {
    q: "You INNER JOIN #silver_attendance to #ref_ethnic_category. The row count falls from 19,945 to about 19,250. Where did the rest go?",
    a: "INNER JOIN drops rows that have no match. The missing rows have no ethnic code. Your total attendances are now wrong. Use LEFT JOIN when the left table is the population." },
  ste: [
    "INNER JOIN keeps only rows that match in both tables.",
    "LEFT JOIN keeps every row from the left table.",
    "When there is no match, the right-hand columns are NULL.",
    "Put a filter on the right table in the ON clause. A filter in WHERE turns a LEFT JOIN into an INNER JOIN.",
    "Check the row count before and after each join."
  ],
  steps: [
    "Count the rows in the left table.",
    "Join to the lookup with LEFT JOIN.",
    "Count the rows again. The count must not change.",
    "Find the rows where the lookup key is NULL.",
    "Report the unmatched codes and their counts."
  ],
  sql: `-- Ethnicity breakdown with a safe LEFT JOIN. Row count stays the same.
SELECT
    COALESCE(e.broad_group, 'Missing')              AS broad_group,
    COUNT(*)                                         AS attendances,
    CAST(100.0 * COUNT(*) / SUM(COUNT(*)) OVER () AS DECIMAL(5,1)) AS pct
FROM #silver_attendance AS a
LEFT JOIN #ref_ethnic_category AS e ON e.ethnic_code = a.ethnic_code
GROUP BY COALESCE(e.broad_group, 'Missing')
ORDER BY attendances DESC;

-- Orphan check: disposal codes with no lookup
SELECT a.disposal_code, COUNT(*) AS n
FROM #silver_attendance AS a
LEFT JOIN #ref_attendance_disposal AS d ON d.disposal_code = a.disposal_code
WHERE d.disposal_code IS NULL
GROUP BY a.disposal_code;`,
  pitfalls: [
    "A lookup with duplicate keys multiplies your rows. Give every lookup a primary key.",
    "SUM(COUNT(*)) OVER () is a window over the grouped result. It gives the grand total for the percentage."
  ],
  video: { title: "SQL joins visually explained", who: "Data with Baraa (SQL Full Course)", url: yt("Data with Baraa SQL joins visually explained") },
  drills: [
    { id: "j1", q: "What percentage of attendances in #silver_attendance left before treatment or after refusing treatment (is_left_before_treatment = 1)? Give 1 decimal place.", ans: 2.8, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * SUM(IIF(d.is_left_before_treatment = 1, 1, 0)) / COUNT(*) AS DECIMAL(5,1)) AS pct_left
FROM #silver_attendance AS a
LEFT JOIN #ref_attendance_disposal AS d ON d.disposal_code = a.disposal_code;` },
    { id: "j2", q: "How many attendances in #silver_attendance have no valid triage category?", ans: 80,
      sql: `SELECT COUNT(*) AS no_triage
FROM #silver_attendance AS a
LEFT JOIN #ref_triage_category AS t ON t.triage_category = a.triage_category
WHERE t.triage_category IS NULL;` }
  ]
},
/* ------------------------------------------------------------------ 10 */
{
  id: "windows", title: "Reattendance with window functions", stage: "Gold", needs: ["01","02"],
  nhs: "Unplanned reattendance within 7 days is an ECDS quality indicator. Frequent attender lists are a common request from ED leads and ICBs.",
  diagram: { type: "timeline", max: 10, unit: "days",
    marks: [{ t: 0, label: "Visit 1 departs" }, { t: 3, label: "Visit 2 (reattend)" }, { t: 7, label: "7-day window ends" }, { t: 9, label: "Visit 3 (not counted)" }],
    caption: "LAG looks back one row in the same patient's history." },
  ponder: {
    q: "Why do you measure from the previous departure and not from the previous arrival?",
    a: "The patient leaves at departure. A long stay would use up the window while the patient is still in the department. The 7 days start when the previous attendance ends." },
  ste: [
    "A window function calculates a value across a set of related rows.",
    "The window function does not remove rows. GROUP BY does.",
    "PARTITION BY makes one set for each patient.",
    "ORDER BY puts each patient's visits in time order.",
    "LAG gives a value from the previous row in the set."
  ],
  steps: [
    "Keep rows with a valid NHS number.",
    "Partition by NHS number. Order by arrival, then attendance_id.",
    "Get the previous departure with LAG.",
    "Mark a reattendance when the arrival is within 7 days after the previous departure.",
    "Exclude planned follow-ups (attendance category 2)."
  ],
  sql: `WITH visits AS (
    SELECT
        attendance_id, nhs_number, arrival_dttm, departure_dttm, attendance_category,
        LAG(departure_dttm) OVER (PARTITION BY nhs_number ORDER BY arrival_dttm, attendance_id) AS prev_departure_dttm
    FROM #silver_attendance
    WHERE nhs_status = 'Valid'
)
SELECT
    COUNT(*) AS attendances,
    SUM(IIF(attendance_category <> 2
            AND arrival_dttm >  prev_departure_dttm
            AND arrival_dttm <= DATEADD(DAY, 7, prev_departure_dttm), 1, 0)) AS unplanned_reattend_7d
FROM visits;`,
  pitfalls: [
    "Without a tie-breaker (attendance_id) in ORDER BY, LAG can pick a different row each run.",
    "A missing NHS number puts many patients into one NULL partition. Filter them out first."
  ],
  video: { title: "Window functions: LAG, LEAD, running totals", who: "Data with Baraa (SQL Full Course)", url: yt("Data with Baraa SQL window functions LAG LEAD") },
  drills: [
    { id: "r1", q: "What is the highest number of attendances by one patient? Count patients with a valid NHS number only.", ans: 15,
      sql: `SELECT TOP (1) COUNT(*) AS most_visits
FROM #silver_attendance
WHERE nhs_status = 'Valid'
GROUP BY nhs_number
ORDER BY most_visits DESC;` },
    { id: "r2", q: "How many unplanned reattendances within 7 days are there? Use the method from the lesson query.", ans: 442,
      sql: `WITH visits AS (
    SELECT attendance_category, arrival_dttm,
           LAG(departure_dttm) OVER (PARTITION BY nhs_number ORDER BY arrival_dttm, attendance_id) AS prev_dep
    FROM #silver_attendance
    WHERE nhs_status = 'Valid'
)
SELECT COUNT(*) AS unplanned_reattend_7d
FROM visits
WHERE attendance_category <> 2
  AND arrival_dttm > prev_dep
  AND arrival_dttm <= DATEADD(DAY, 7, prev_dep);` },
    { id: "r3", q: "How many patients attended 5 times or more (frequent attenders)? Count valid NHS numbers only.", ans: 217,
      sql: `SELECT COUNT(*) AS frequent_attenders
FROM (SELECT nhs_number FROM #silver_attendance
      WHERE nhs_status = 'Valid'
      GROUP BY nhs_number HAVING COUNT(*) >= 5) AS x;` }
  ]
},
/* ------------------------------------------------------------------ 11 */
{
  id: "unpivot", title: "Repeating groups to rows", stage: "Silver", needs: ["01","02"],
  nhs: "ECDS sends many diagnoses, investigations and treatments per attendance. Analysts ask 'how many had a CT head?' The wide layout (Inv1…Inv13) makes that hard.",
  diagram: { type: "grid", arrow: "CROSS APPLY (VALUES …)",
    before: { cols: ["AE_ID", "Inv1", "Inv2", "Inv3"], rows: [["2", "Urinalysis", "Blood Cultures", "X-Ray - Chest"], ["5", "CT Head", "NULL", "NULL"]] },
    after:  { cols: ["AE_ID", "pos", "investigation"], rows: [["2", "1", "Urinalysis"], ["2", "2", "Blood Cultures"], ["2", "3", "X-Ray - Chest"], ["5", "1", "CT Head"]] },
    caption: "Wide to long. One row for each value that exists." },
  ponder: {
    q: "How would you count attendances with a 'CT Head' investigation in the wide table?",
    a: "You need Inv1 = 'CT Head' OR Inv2 = 'CT Head' OR … thirteen times. In the long table it is one condition. That is why silver stores repeating groups as rows." },
  ste: [
    "A repeating group is a set of columns with the same meaning: Inv1, Inv2 and so on.",
    "Repeating groups break first normal form.",
    "CROSS APPLY with VALUES makes one row for each column in the group.",
    "Remove the empty positions after the change.",
    "Keep the position number. Position 1 is the primary diagnosis."
  ],
  steps: [
    "List the columns in the group.",
    "Write one VALUES row for each position.",
    "Add the position number to each VALUES row.",
    "Filter out NULL values.",
    "Insert the result into a child table with a primary key."
  ],
  sql: `-- Investigations: wide (Inv1..Inv13) -> long
SELECT r.AE_ID, r.AE_Episode_Number, i.pos, i.investigation, i.inv_dttm
FROM dbo.ED_sandpit AS r
CROSS APPLY (VALUES
    (1, r.Inv1, r.Inv1_DTTM), (2, r.Inv2, r.Inv2_DTTM), (3, r.Inv3, r.Inv3_DTTM),
    (4, r.Inv4, r.Inv4_DTTM), (5, r.Inv5, r.Inv5_DTTM), (6, r.Inv6, r.Inv6_DTTM),
    (7, r.Inv7, r.Inv7_DTTM), (8, r.Inv8, r.Inv8_DTTM), (9, r.Inv9, r.Inv9_DTTM),
    (10, r.Inv10, r.Inv10_DTTM), (11, r.Inv11, r.Inv11_DTTM), (12, r.Inv12, r.Inv12_DTTM),
    (13, r.Inv13, r.Inv13_DTTM)
) AS i (pos, investigation, inv_dttm)
WHERE i.investigation IS NOT NULL;`,
  pitfalls: [
    "Count distinct episodes, not rows. One episode can have the same test two times, and the raw table has duplicate episodes.",
    "Diagnosis codes like '02' are text. Do not convert them to numbers: you lose the leading zero."
  ],
  video: { title: "UNPIVOT vs CROSS APPLY VALUES", who: "Search: T-SQL unpivot cross apply", url: yt("SQL Server unpivot CROSS APPLY VALUES") },
  drills: [
    { id: "u1", q: "How many distinct episodes (AE_Episode_Number) had a 'CT Head' investigation?", ans: 1368,
      sql: `SELECT COUNT(DISTINCT r.AE_Episode_Number) AS ct_head_episodes
FROM dbo.ED_sandpit AS r
CROSS APPLY (VALUES (r.Inv1),(r.Inv2),(r.Inv3),(r.Inv4),(r.Inv5),(r.Inv6),(r.Inv7),
                    (r.Inv8),(r.Inv9),(r.Inv10),(r.Inv11),(r.Inv12),(r.Inv13)) AS i (inv)
WHERE i.inv = 'CT Head';` },
    { id: "u2", q: "What is the most common primary diagnosis group (diag_position = 1) in #silver_attendance_diagnosis? Type the group name.", ans: "Injury", fmt: "a group name",
      sql: `SELECT TOP (1) diag_group
FROM #silver_attendance_diagnosis
WHERE diag_position = 1
GROUP BY diag_group
ORDER BY COUNT(*) DESC;` },
    { id: "u3", q: "What percentage of attendances in #silver_attendance have no diagnosis at all? Give 1 decimal place.", ans: 2, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * COUNT(*) / (SELECT COUNT(*) FROM #silver_attendance) AS DECIMAL(5,1)) AS pct_no_diag
FROM #silver_attendance AS a
WHERE NOT EXISTS (SELECT 1 FROM #silver_attendance_diagnosis AS d
                  WHERE d.attendance_id = a.attendance_id);` }
  ]
},
/* ------------------------------------------------------------------ 12 */
{
  id: "star", title: "Star schema for Power BI", stage: "Gold", needs: ["01","02","03"],
  nhs: "Most NHS BI teams publish in Power BI. A clean star schema makes measures fast and stops double counting. NHS financial years start on 1 April.",
  diagram: { type: "star", center: "fact_attendance", points: ["dim_date", "dim_patient", "#ref_department_type", "#ref_triage_category", "#ref_attendance_disposal", "#ref_ethnic_category"],
    caption: "Facts are events with numbers. Dimensions describe the event." },
  ponder: {
    q: "Why does dim_date have a row for every day, even on days with no attendances?",
    a: "A chart of daily attendances must show zero on a day with no data. If the day is missing from dim_date, the day is missing from the chart. A full calendar also holds the financial year, so every report uses the same rule." },
  ste: [
    "A fact table has one row for each event. Here the event is one attendance.",
    "A fact table holds keys and measures. Measures are numbers that you add.",
    "A dimension table describes the facts: when, who, where, what type.",
    "Each dimension joins to the fact by one key.",
    "The grain is the meaning of one fact row. Write the grain in a comment."
  ],
  steps: [
    "Write the grain: one row per ED attendance.",
    "Create dim_date with a tally. Do not use a loop.",
    "Add the NHS financial year to dim_date.",
    "Create the fact table with keys and flags.",
    "Load the fact table from silver.",
    "In production, connect Power BI to the gold views only."
  ],
  sql: `-- Run sql/03_gold.sql in this window first (after 01 and 02). It builds and loads gold.

-- Test the grain: one row per attendance
SELECT COUNT(*) AS fact_rows, COUNT(DISTINCT attendance_id) AS distinct_ids
FROM #gold_fact_attendance;

-- Financial-year view
SELECT d.fin_year, d.fin_month_no, COUNT(*) AS attendances
FROM #gold_fact_attendance AS f
JOIN #gold_dim_date AS d ON d.date_key = f.arrival_date_key
GROUP BY d.fin_year, d.fin_month_no
ORDER BY d.fin_year, d.fin_month_no;`,
  pitfalls: [
    "Do not join two fact tables directly. Join each to shared dimensions.",
    "An integer date key (yyyymmdd) is easy to read and fast to join."
  ],
  video: { title: "Star schema: facts and dimensions explained", who: "Search: star schema explained", url: yt("star schema fact dimension explained data warehouse") },
  drills: [
    { id: "s1", q: "How many rows are in #gold_fact_attendance after the load?", ans: 19945,
      sql: `SELECT COUNT(*) AS fact_rows FROM #gold_fact_attendance;` },
    { id: "s2", q: "What is the 4-hour performance for attendances that arrived at the weekend? Give 1 decimal place.", ans: 71.5, tol: 0.05, unit: "%",
      sql: `SELECT CAST(100.0 * SUM(CAST(f.within_4h AS INT)) / COUNT(f.within_4h) AS DECIMAL(5,1)) AS pct_4h_weekend
FROM #gold_fact_attendance AS f
JOIN #gold_dim_date AS d ON d.date_key = f.arrival_date_key
WHERE d.is_weekend = 1;
-- COUNT(f.within_4h) skips NULL: rows with no usable duration are left out.` }
  ]
},
/* ------------------------------------------------------------------ 13 */
{
  id: "scd", title: "Incremental loads and history (SCD2)", stage: "Gold", needs: ["01","02","03"],
  nhs: "Patients move house, change GP and update their ethnicity. A report on 'activity by registered practice at the time' needs history. Large trusts cannot reload everything each night.",
  diagram: { type: "grid", arrow: "close old row, insert new row",
    before: { cols: ["patient", "ethnic", "valid_to", "current"], rows: [["X1", "Z", "9999-12-31", "1"]] },
    after:  { cols: ["patient", "ethnic", "valid_to", "current"], rows: [["X1", "Z", "2026-02-01", "0"], ["X1", "A", "9999-12-31", "1"]] },
    caption: "Slowly changing dimension Type 2: never overwrite. Close and add." },
  ponder: {
    q: "281 patients have more than one raw Postcode value across their visits. After cleaning (upper case, no extra spaces), the number is 0. What does this tell you about SCD2?",
    a: "Clean before you compare. Otherwise 'nt2 1es' and 'NT2 1ES' look like a house move, and SCD2 makes 281 false history rows. Track changes only on cleaned, meaningful values." },
  ste: [
    "A full load deletes all rows and loads them again.",
    "An incremental load processes only new and changed rows.",
    "SCD Type 2 keeps old versions of a row.",
    "Each version has a start time, an end time and a current flag.",
    "Use UPDATE then INSERT. Many teams avoid MERGE because of known problems."
  ],
  steps: [
    "Get the latest cleaned value for each patient.",
    "Find current rows where any tracked column changed.",
    "Close those rows: set valid_to and is_current = 0.",
    "Insert a new current row for changed and new patients.",
    "Put both steps in one transaction."
  ],
  sql: `-- Incremental: process only rows modified since the last successful run
DECLARE @since DATETIME2(0) =
    (SELECT MAX(started_dttm) FROM #etl_load_log
     WHERE process_name = 'silver.attendance' AND status = 'Succeeded');

SELECT COUNT(*) AS rows_to_process
FROM dbo.ED_sandpit
WHERE Modif_DTTM > @since;   -- watermark

-- SCD2 close step (full code in sql/03_gold.sql, step 5.2). Run 03 twice to see it work.
-- UPDATE d SET valid_to = @now, is_current = 0
-- FROM #gold_dim_patient d JOIN #src s ON s.patient_pseudo_id = d.patient_pseudo_id
-- WHERE d.is_current = 1
--   AND EXISTS (SELECT s.postcode_district, s.gp_practice_code, s.ethnic_code
--               EXCEPT
--               SELECT d.postcode_district, d.gp_practice_code, d.ethnic_code);`,
  pitfalls: [
    "A watermark on a column that the source does not always update will miss changes. Test it.",
    "A filtered unique index (WHERE is_current = 1) stops two current rows for one patient."
  ],
  video: { title: "Slowly changing dimensions Type 2 in SQL Server", who: "Search: SCD Type 2 T-SQL", url: yt("slowly changing dimension type 2 SQL Server T-SQL") },
  drills: [
    { id: "c1", q: "How many patients with a valid NHS number have more than one ethnic code across their attendances? Treat NULL as a value of its own.", ans: 409,
      sql: `SELECT COUNT(*) AS patients_with_changes
FROM (SELECT nhs_number
      FROM #silver_attendance
      WHERE nhs_status = 'Valid'
      GROUP BY nhs_number
      HAVING COUNT(DISTINCT COALESCE(ethnic_code, '?')) > 1) AS x;` },
    { id: "c2", q: "After the first gold load, how many rows are in #gold_dim_patient?", ans: 12357,
      sql: `SELECT COUNT(*) AS dim_patient_rows FROM #gold_dim_patient;` }
  ]
},
/* ------------------------------------------------------------------ 14 */
{
  id: "perf", title: "Indexes and fast queries", stage: "All layers", needs: ["01","02"],
  nhs: "Trust warehouses hold years of ECDS, APC and OP data. A slow query blocks the nightly load and the morning reports. Performance tuning is a core data engineer skill.",
  diagram: { type: "tree", levels: [["Root page"], ["2025-10 … 2026-03", "2026-04 … 2026-10"], ["Oct", "Nov", "Dec", "Apr", "May", "Jun"]], highlight: [0, 1, 2],
    caption: "A B-tree index finds a range by reading a few pages, not the whole table." },
  ponder: {
    q: "WHERE YEAR(arrival_dttm) = 2026 and WHERE arrival_dttm >= '20260101' AND arrival_dttm < '20270101' return the same rows. Which one can use an index seek?",
    a: "Only the range. A function on the column hides the column from the index. The server must calculate YEAR() for every row. A predicate that can use an index seek is 'SARGable'." },
  ste: [
    "An index is a sorted copy of some columns.",
    "A seek reads only the rows you need. A scan reads all rows.",
    "Do not put a function on a column in WHERE. Put it on the constant.",
    "INCLUDE adds columns to the index leaf. Then the query does not need the table.",
    "Measure with SET STATISTICS IO ON. Fewer logical reads is better."
  ],
  steps: [
    "Run the query with SET STATISTICS IO, TIME ON.",
    "Read the logical reads in the Messages tab.",
    "Open the actual execution plan.",
    "Make the predicate SARGable.",
    "Add an index that covers the query.",
    "Run the query again and compare the reads."
  ],
  sql: `SET STATISTICS IO, TIME ON;

-- Bad: function on the column -> scan
SELECT COUNT(*) FROM #silver_attendance WHERE YEAR(arrival_dttm) = 2026;

-- Good: range on the column -> seek (after the index exists)
SELECT COUNT(*) FROM #silver_attendance
WHERE arrival_dttm >= '20260101' AND arrival_dttm < '20270101';

DROP INDEX IF EXISTS ix_attendance_arrival ON #silver_attendance;   -- safe to run again
CREATE INDEX ix_attendance_arrival
    ON #silver_attendance (arrival_dttm)
    INCLUDE (departure_dttm, dept_type, nhs_number);

SET STATISTICS IO, TIME OFF;`,
  pitfalls: [
    "Every index slows inserts. Index for real queries, not for every column.",
    "An implicit conversion (VARCHAR column vs NVARCHAR value) can stop a seek. Match the data types.",
    "SQL Server 2017 runs a scalar function once per row and blocks a parallel plan. On millions of rows, use an inline table-valued function with CROSS APPLY, like the production etl.fn_nhs_number_check (sql/reference_only/02_silver.sql)."
  ],
  video: { title: "How to Think Like the SQL Server Engine (free)", who: "Brent Ozar - free training videos", url: "https://www.brentozar.com/free-sql-server-training-videos/" },
  drills: [
    { id: "x1", q: "Rewrite WHERE CONVERT(DATE, arrival_dttm) = '20260115' as a SARGable date range. How many attendances arrived on that day?", ans: 53,
      sql: `SELECT COUNT(*) AS arrivals
FROM #silver_attendance
WHERE arrival_dttm >= '20260115' AND arrival_dttm < '20260116';` },
    { id: "x2", q: "Use a SARGable range again. How many attendances arrived in calendar year 2026?", ans: 15066,
      sql: `SELECT COUNT(*) AS arrivals_2026
FROM #silver_attendance
WHERE arrival_dttm >= '20260101' AND arrival_dttm < '20270101';` }
  ]
},
/* ------------------------------------------------------------------ 15 */
{
  id: "ig", title: "Information governance in SQL", stage: "Gold", needs: ["01","02","03"],
  nhs: "Data leaving the trust must follow the Caldicott principles and the data protection rules. Pseudonymisation and small-number suppression are standard steps in every external extract.",
  diagram: { type: "flow", nodes: ["NHS number", "+ secret salt", "HASHBYTES SHA2_256", "pseudo ID (64 hex)", "Counts < threshold → *"],
    caption: "Same input + same salt = same pseudo ID. Linkage still works. Identity does not leave." },
  ponder: {
    q: "Why add a salt, when SHA-256 of the NHS number is already one-way?",
    a: "There are only about 10 billion possible 10-digit numbers. An attacker can hash all of them and look up the result. A long secret salt makes that table useless without the salt." },
  ste: [
    "Pseudonymisation replaces an identifier with a code.",
    "A hash gives the same code for the same input.",
    "Keep the salt secret. Do not put the salt in Git.",
    "Small numbers can identify a person. Suppress them in outputs.",
    "Use the threshold that your organisation's disclosure rule sets."
  ],
  steps: [
    "Create a secret salt with CRYPT_GEN_RANDOM.",
    "Store the salt in a table that only the load account can read.",
    "Hash salt plus NHS number with SHA2_256.",
    "Remove names, addresses and full postcodes from gold.",
    "Suppress small counts in every external table."
  ],
  sql: `DECLARE @threshold INT = 5;    -- use your organisation's rule

-- Suppressed table: under-16 attendances by GP practice and month
WITH c AS (
    SELECT a.gp_practice_code,
           DATEFROMPARTS(YEAR(a.arrival_dttm), MONTH(a.arrival_dttm), 1) AS month_start,
           COUNT(*) AS n
    FROM #silver_attendance AS a
    WHERE a.age_at_arrival < 16
    GROUP BY a.gp_practice_code, DATEFROMPARTS(YEAR(a.arrival_dttm), MONTH(a.arrival_dttm), 1)
)
SELECT gp_practice_code, month_start,
       IIF(n < @threshold, '*', CAST(n AS VARCHAR(10))) AS attendances
FROM c
ORDER BY gp_practice_code, month_start;`,
  pitfalls: [
    "If you suppress one cell but publish the row total, a reader can calculate the hidden value. Check secondary suppression.",
    "Hashing is pseudonymisation, not anonymisation. The output is still personal data under UK GDPR."
  ],
  video: { title: "HASHBYTES and hashing in SQL Server", who: "Search: HASHBYTES SHA2_256 salt", url: yt("SQL Server HASHBYTES SHA2_256 salt pseudonymisation") },
  drills: [
    { id: "g1", q: "Build the table of under-16 attendances by GP practice and month. With a threshold of 5, how many cells are suppressed?", ans: 12,
      sql: `SELECT COUNT(*) AS suppressed_cells
FROM (SELECT gp_practice_code, DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1) AS m, COUNT(*) AS n
      FROM #silver_attendance
      WHERE age_at_arrival < 16
      GROUP BY gp_practice_code, DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1)) AS x
WHERE n < 5;` },
    { id: "g2", q: "How many characters long is a SHA2_256 pseudo ID when it is written as hexadecimal?", ans: 64,
      sql: `DECLARE @salt VARBINARY(32) = (SELECT TOP (1) salt FROM #etl_secret_salt);
SELECT LEN(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @salt + CAST('9991356797' AS VARBINARY(10))), 2)) AS hex_length;` }
  ]
},
/* ------------------------------------------------------------------ 16 */
{
  id: "tests", title: "Tests, automation and the loop", stage: "All layers", needs: ["01","02","03","04"],
  nhs: "Trusts submit ECDS to SUS on a fixed timetable. A failed or wrong load is visible nationally. Automated tests catch problems before the submission and before the board pack.",
  diagram: { type: "loop", nodes: ["Change code", "Run load", "Run tests", "Pass? keep", "Fail? roll back + log"],
    caption: "Karpathy's loop: a change is kept only when a real check says it improved. The tests are the check." },
  ponder: {
    q: "A test says 'valid NHS numbers ≥ 95%'. The result is 98.8%. Does this prove that the data is correct?",
    a: "Not proven. The test only proves that one rule passed. A good test suite checks many independent rules: counts, keys, ranges, orphans and totals against the source. Each test closes one way to be wrong." },
  ste: [
    "A data test is a query that returns a number.",
    "A rule compares the number with a threshold.",
    "The test passes or fails. It never 'looks fine'.",
    "Run the tests after every load. Store every result.",
    "Stop the next step when a test fails."
  ],
  steps: [
    "Write one test for each rule that matters.",
    "Store the results in #dq_test_result.",
    "Run sql/04_dq_tests.sql after sql/02_silver.sql.",
    "Make the job stop when a test fails.",
    "Keep all SQL files in Git. Review each change."
  ],
  sql: `-- The nightly job in production (SQL Server Agent: one step for each line):
--   EXEC etl.usp_load_silver_attendance;
--   EXEC dq.usp_run_tests @fail_on_error = 1;   -- THROW stops the job here on failure
--   EXEC etl.usp_load_gold;
-- The same job here, in one query window, in this order:
--   1. sql/02_silver.sql
--   2. sql/04_dq_tests.sql   (set @fail_on_error = 1 to see the job stop with Msg 50001)
--   3. sql/03_gold.sql       (a real job runs this only when every test passes)

-- Trend of each test over time
SELECT test_name, CAST(run_dttm AS DATE) AS run_date, measured, passed
FROM #dq_test_result
ORDER BY test_name, run_dttm;`,
  pitfalls: [
    "A test with a threshold that nobody agreed is an opinion. Agree thresholds with the data owner.",
    "Tests in a separate job can run after the report already went out. Put them in the same job."
  ],
  video: { title: "Unit testing T-SQL with tSQLt", who: "Search: tSQLt tutorial", url: yt("tSQLt unit testing SQL Server tutorial") },
  drills: [
    { id: "q1", q: "Run sql/04_dq_tests.sql. How many tests fail?", ans: 1,
      sql: `-- Run sql/04_dq_tests.sql first. Then:
SELECT COUNT(*) AS failed
FROM #dq_test_result
WHERE run_id = (SELECT TOP (1) run_id FROM #dq_test_result ORDER BY run_dttm DESC)
  AND passed = 0;` },
    { id: "q2", q: "What is the name of the test that fails? Type the test_name value.", ans: "departure_before_arrival", fmt: "a test name", accept: ["departure before arrival"],
      sql: `SELECT test_name
FROM #dq_test_result
WHERE run_id = (SELECT TOP (1) run_id FROM #dq_test_result ORDER BY run_dttm DESC)
  AND passed = 0;` }
  ]
}
];
