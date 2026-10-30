/* ED SQL - help for every drill.
   Each entry: hint (a nudge) and steps (the method, written in ASD-STE100 Simplified Technical English).
   The answer and the best query come from lessons.js / scenarios.js. */

window.DRILL_HELP = {
  /* ---------- 1 Profile ---------- */
  p1: { hint: "Group by the episode number. Keep only groups with more than one row. Then count the groups.",
    steps: ["Select AE_Episode_Number from dbo.ED_sandpit.", "Group the rows by AE_Episode_Number.", "Keep the groups where COUNT(*) > 1. Use HAVING for this, not WHERE.", "Put that query in a subquery.", "Count the rows of the subquery."] },
  p2: { hint: "Your database ignores upper and lower case. 'm' = 'M'. Make the comparison case-sensitive.",
    steps: ["Find the collation: a name with _CI_ means case-insensitive.", "Add COLLATE Latin1_General_CS_AS after the column name.", "Keep rows where Sex is not in ('M', 'F').", "Also keep rows where Sex IS NULL. NOT IN does not return NULL rows.", "Count the rows."] },
  p3: { hint: "Percentage = rows with NULL ÷ all rows × 100. Divide by 100.0, not 100.",
    steps: ["Count the rows where Eth_Group_Code IS NULL. Use SUM(IIF(... , 1, 0)).", "Count all rows with COUNT(*).", "Multiply by 100.0 to get a decimal result.", "Divide the first count by the second count.", "CAST the result AS DECIMAL(5,1)."] },

  /* ---------- 2 NULLs ---------- */
  n1: { hint: "COUNT(Seen_DTTM) does not count NULL. COUNT(*) counts every row.",
    steps: ["Write COUNT(*) to count every row.", "Write COUNT(Seen_DTTM) to count the filled values.", "Subtract the second from the first.", "The difference is the number of NULL values."] },
  n2: { hint: "Three conditions: IS NULL, or the code 'Z', or the code '99'. Join them with OR.",
    steps: ["Write WHERE Eth_Group_Code IS NULL.", "Add OR Eth_Group_Code IN ('Z', '99').", "Do not write = NULL. It never finds a row.", "Count the rows."] },
  n3: { hint: "Compare DoB with the date '19000101'. The format yyyymmdd is safe in every language setting.",
    steps: ["Select from dbo.ED_sandpit.", "Write WHERE DoB = '19000101'.", "Count the rows.", "Look at the Age column for these rows: 125 or 126. The age comes from the placeholder."] },
  n4: { hint: "Find rows where Departed_DTTM IS NULL. Then look at MIN and MAX of Arrived_DTTM for those rows.",
    steps: ["Write WHERE Departed_DTTM IS NULL.", "Count the rows.", "Add MIN(Arrived_DTTM) and MAX(Arrived_DTTM) to the SELECT.", "Compare the dates with the end of the extract (11 October 2026).", "Decide: is a missing departure an error, or a patient who is still in the department?"] },

  /* ---------- 3 Types ---------- */
  t1: { hint: "Do not convert anything. Just take MAX of the text column.",
    steps: ["Write SELECT MAX(census_date) FROM dbo.ED_sandpit.", "Read the result.", "Notice that text sorts character by character, from the left."] },
  t2: { hint: "CONVERT(DATE, census_date, 103). Style 103 means dd/mm/yyyy.",
    steps: ["Write CONVERT(DATE, census_date, 103).", "Put MAX() around it.", "Run the query.", "Write the result as yyyy-mm-dd."] },
  t3: { hint: "Human body temperature in Celsius is near 37. A value above 45 is not Celsius.",
    steps: ["Select from dbo.ED_sandpit.", "Write WHERE Temperature > 45.", "Count the rows."] },
  t4: { hint: "REPLACE(Blood_Pressure, ' ', '') removes the spaces. Then use NOT LIKE '[0-9]%/[0-9]%'.",
    steps: ["Keep only rows where Blood_Pressure IS NOT NULL.", "Remove the spaces with REPLACE.", "Test the pattern: a digit, any text, a slash, a digit, any text.", "Keep rows that do NOT match the pattern.", "Count the rows."] },
  t5: { hint: "Put three REPLACE calls inside each other: spaces to '', '\\' to '/', '-' to '/'.",
    steps: ["Start from the query in the last drill.", "Change '\\' to '/' with a second REPLACE.", "Change '-' to '/' with a third REPLACE.", "Run the NOT LIKE test again.", "Count the rows. Look at the values that are left."] },

  /* ---------- 4 NHS number ---------- */
  v1: { hint: "Run sql/01 and sql/02 in this window. #etl_nhs_check has the result for every row of dbo.ED_sandpit.",
    steps: ["Run sql/01_reference.sql, then sql/02_silver.sql, in the same query window.", "Write FROM #etl_nhs_check.", "Keep rows where nhs_status = 'Checksum fail'.", "Count the rows.", "Optional: get the same number from the lesson query, which calculates the rule from dbo.ED_sandpit."] },
  v2: { hint: "Use #etl_nhs_check, keep 'Valid', then COUNT(DISTINCT ...).",
    steps: ["Write FROM #etl_nhs_check.", "Keep rows where nhs_status = 'Valid'.", "Count the distinct nhs_number values, not the rows.", "One patient can have many attendances."] },
  v3: { hint: "Missing means NULL here.",
    steps: ["Write WHERE NHSNo IS NULL.", "Count the rows."] },

  /* ---------- 5 Duplicates ---------- */
  d1: { hint: "ROW_NUMBER() OVER (PARTITION BY AE_Episode_Number ORDER BY Modif_DTTM DESC). Keep rn = 1.",
    steps: ["Write a CTE that selects ROW_NUMBER() for each row.", "PARTITION BY AE_Episode_Number makes one group for each episode.", "ORDER BY Modif_DTTM DESC puts the newest version first.", "Add AE_ID DESC as a tie-breaker.", "Outside the CTE, count the rows where rn = 1."] },
  d2: { hint: "Join the table to itself on AE_Episode_Number, so that each duplicate pair becomes one row. Then compare the columns of the two copies.",
    steps: ["Join dbo.ED_sandpit AS a to dbo.ED_sandpit AS b.", "Join ON b.AE_Episode_Number = a.AE_Episode_Number AND b.AE_ID > a.AE_ID. This gives one row for each pair.", "Look at a few pairs side by side. Find the column that changes.", "To prove it, test candidate columns: one VALUES row for each column, with 1 when a and b differ.", "Keep the columns where the number of differences equals the number of pairs.", "Type the column name."] },

  /* ---------- 6 Silver ---------- */
  m1: { hint: "Run sql/01 and sql/02 in this window first. Script 02 loads #silver_attendance.",
    steps: ["Run sql/01_reference.sql, then sql/02_silver.sql, in the same query window.", "Read #etl_load_log. The status must be 'Succeeded'.", "Count the rows in #silver_attendance."] },
  m2: { hint: "dq_flags is a comma list. Use LIKE '%DEPARTURE_BEFORE_ARRIVAL%'.",
    steps: ["Select from #silver_attendance.", "Write WHERE dq_flags LIKE '%DEPARTURE_BEFORE_ARRIVAL%'.", "Count the rows."] },
  m3: { hint: "Same method as the last drill, with the flag DOB_PLACEHOLDER.",
    steps: ["Select from #silver_attendance.", "Write WHERE dq_flags LIKE '%DOB_PLACEHOLDER%'.", "Count the rows. Compare with lesson 2: the duplicates did not include these rows."] },

  /* ---------- 7 Durations ---------- */
  w1: { hint: "Compare the two datetime columns directly: Departed_DTTM < Arrived_DTTM.",
    steps: ["Select from dbo.ED_sandpit.", "Write WHERE Departed_DTTM < Arrived_DTTM.", "Count the rows."] },
  w2: { hint: "PERCENTILE_CONT is a window function: it needs OVER (). Use SELECT DISTINCT to get one row.",
    steps: ["Keep Type 1 rows: dept_type = 1.", "Keep rows where seen_dttm >= arrival_dttm.", "Calculate DATEDIFF(MINUTE, arrival_dttm, seen_dttm).", "Put it in PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ...) OVER ().", "Use SELECT DISTINCT, because the window gives the same value on every row."] },
  w3: { hint: "12 hours = 43,200 seconds. Use DATEDIFF(SECOND, ...).",
    steps: ["Select from #silver_attendance.", "Keep dept_type = 1.", "Calculate DATEDIFF(SECOND, arrival_dttm, departure_dttm).", "Keep rows where the result is more than 43200.", "Count the rows."] },
  w4: { hint: "24 hours = 86,400 seconds. Do not filter on department type.",
    steps: ["Select from #silver_attendance.", "Calculate the seconds from arrival to departure.", "Keep rows where the result is more than 86400.", "Count the rows."] },

  /* ---------- 8 Aggregation ---------- */
  a1: { hint: "Numerator: rows with seconds ≤ 14,400. Denominator: all Type 1 rows with a usable duration.",
    steps: ["Keep dept_type = 1.", "Keep rows where departure_dttm >= arrival_dttm. This removes NULL and negative durations.", "Count rows within 4 hours: SUM(IIF(DATEDIFF(SECOND, ...) <= 14400, 1, 0)).", "Divide by COUNT(*). Multiply by 100.0.", "CAST the result AS DECIMAL(5,1)."] },
  a2: { hint: "Group by the first day of the month. Order by the count, highest first, and keep the first row.",
    steps: ["Calculate the month start with DATEFROMPARTS(YEAR(arrival_dttm), MONTH(arrival_dttm), 1).", "Group by the month start.", "Order by COUNT(*), highest first.", "Keep TOP (1).", "Show the month as yyyy-mm: CONVERT(CHAR(7), month_start, 126)."] },
  a3: { hint: "Same method as the Type 1 drill, but filter on age_at_arrival < 16 and all types.",
    steps: ["Keep rows where age_at_arrival < 16.", "Keep rows with a usable duration (departure >= arrival).", "Count rows within 14,400 seconds.", "Divide by all kept rows and multiply by 100.0.", "Round to 1 decimal place."] },
  a4: { hint: "Use a half-open range: arrival_dttm >= '20261001' AND arrival_dttm < '20261101'.",
    steps: ["Select from #silver_attendance.", "Keep arrivals from 1 October 2026, up to but not including 1 November 2026.", "Count the rows.", "Compare with a full month (about 1,500 to 1,800).", "Decide how to show a partial month in a trend."] },

  /* ---------- 9 Joins ---------- */
  j1: { hint: "LEFT JOIN #ref_attendance_disposal. Count rows where is_left_before_treatment = 1.",
    steps: ["Run sql/01 and sql/02 in this window first.", "LEFT JOIN #silver_attendance to #ref_attendance_disposal on disposal_code.", "Count rows where d.is_left_before_treatment = 1.", "Divide by COUNT(*) of all attendances. Multiply by 100.0.", "Round to 1 decimal place."] },
  j2: { hint: "LEFT JOIN to #ref_triage_category. A row with no match has NULL on the right side.",
    steps: ["LEFT JOIN #silver_attendance AS a to #ref_triage_category AS t.", "Join ON t.triage_category = a.triage_category.", "Keep rows where t.triage_category IS NULL.", "Count the rows."] },

  /* ---------- 10 Windows ---------- */
  r1: { hint: "Group by nhs_number and count the rows. The answer is the biggest count.",
    steps: ["Keep rows where nhs_status = 'Valid'.", "Group by nhs_number.", "Count the rows in each group.", "Order by the count, highest first.", "Keep TOP (1). Type the count, not the NHS number."] },
  r2: { hint: "LAG(departure_dttm) OVER (PARTITION BY nhs_number ORDER BY arrival_dttm, attendance_id).",
    steps: ["In a CTE, keep valid NHS numbers.", "Add the previous departure with LAG, partitioned by nhs_number.", "Outside the CTE, keep attendance_category <> 2 (not planned).", "Keep rows where arrival is after the previous departure and not more than 7 days after it.", "Count the rows."] },
  r3: { hint: "GROUP BY nhs_number HAVING COUNT(*) >= 5, then count the groups.",
    steps: ["Keep valid NHS numbers.", "Group by nhs_number.", "Keep groups with HAVING COUNT(*) >= 5.", "Put this in a subquery.", "Count the rows of the subquery."] },

  /* ---------- 11 Unpivot ---------- */
  u1: { hint: "CROSS APPLY (VALUES (r.Inv1), (r.Inv2), … (r.Inv13)) AS i (inv). Then filter i.inv = 'CT Head'.",
    steps: ["Write FROM dbo.ED_sandpit AS r.", "Add CROSS APPLY with VALUES. Write one row for each column Inv1 to Inv13.", "Name the new column inv.", "Keep rows where i.inv = 'CT Head'.", "Count DISTINCT r.AE_Episode_Number, not rows."] },
  u2: { hint: "Use #silver_attendance_diagnosis with diag_position = 1. Group by diag_group.",
    steps: ["Select from #silver_attendance_diagnosis.", "Keep diag_position = 1 (the primary diagnosis).", "Group by diag_group.", "Order by COUNT(*), highest first.", "Keep TOP (1). Type the group name."] },
  u3: { hint: "An attendance with no row in #silver_attendance_diagnosis has no diagnosis. Use NOT EXISTS.",
    steps: ["Select from #silver_attendance AS a.", "Put NOT EXISTS (a row in attendance_diagnosis with the same attendance_id) in the WHERE clause.", "Count the rows that are left with COUNT(*). This is the numerator.", "Get the denominator with a subquery: (SELECT COUNT(*) FROM #silver_attendance).", "Multiply by 100.0, divide, and CAST AS DECIMAL(5,1).", "Do not put the subquery inside SUM(). SQL Server stops with Msg 130."] },

  /* ---------- 12 Star ---------- */
  s1: { hint: "Run sql/03_gold.sql in this window first (after 01 and 02).",
    steps: ["Run sql/01 and sql/02 in this window, if you have not.", "Run sql/03_gold.sql. It creates and loads the gold tables.", "Count the rows in #gold_fact_attendance."] },
  s2: { hint: "Join the fact table to #gold_dim_date on arrival_date_key. Keep weekend rows only.",
    steps: ["Join #gold_fact_attendance AS f to #gold_dim_date AS d.", "Join ON d.date_key = f.arrival_date_key.", "Keep rows where d.is_weekend = 1.", "Calculate 100.0 × SUM(CAST(f.within_4h AS INT)) / COUNT(f.within_4h).", "CAST the result AS DECIMAL(5,1)."] },

  /* ---------- 13 SCD2 ---------- */
  c1: { hint: "COUNT(DISTINCT COALESCE(ethnic_code, '?')) > 1 for each patient.",
    steps: ["Keep valid NHS numbers in #silver_attendance.", "Group by nhs_number.", "Change NULL to '?' with COALESCE, so NULL counts as a value.", "Keep groups where COUNT(DISTINCT ...) > 1.", "Count the groups."] },
  c2: { hint: "After the first load, dim_patient has one current row for each valid patient.",
    steps: ["Run sql/03_gold.sql one time in a new window (after 01 and 02).", "Count the rows in #gold_dim_patient.", "A second run of 03 keeps the same rows when nothing changed. That is the SCD2 rule.", "Compare with the number of distinct valid NHS numbers in lesson 4."] },

  /* ---------- 14 Performance ---------- */
  x1: { hint: "Range: arrival_dttm >= '20260115' AND arrival_dttm < '20260116'.",
    steps: ["Do not put CONVERT() on the column.", "Write the start of the day as the first limit, with >=.", "Write the start of the next day as the second limit, with <.", "Count the rows."] },
  x2: { hint: "Range: >= '20260101' AND < '20270101'.",
    steps: ["Do not use YEAR(arrival_dttm).", "Write arrival_dttm >= '20260101'.", "Write AND arrival_dttm < '20270101'.", "Count the rows."] },

  /* ---------- 15 IG ---------- */
  g1: { hint: "Group under-16 rows by GP practice and month. Count the groups where n < 5.",
    steps: ["Keep rows where age_at_arrival < 16.", "Group by gp_practice_code and the month start (DATEFROMPARTS).", "Count the rows in each group as n.", "Put this in a subquery.", "Count the groups where n < 5."] },
  g2: { hint: "SHA2_256 gives 32 bytes. Each byte is 2 hex characters.",
    steps: ["Calculate 32 bytes × 2 characters.", "Or run LEN() on the CONVERT(CHAR(64), HASHBYTES(...), 2) result."] },

  /* ---------- 16 Tests ---------- */
  q1: { hint: "Run sql/04_dq_tests.sql in this window (after 01 and 02).",
    steps: ["Load silver first: sql/01, then sql/02 (lesson 6).", "Run sql/04_dq_tests.sql. It runs every test and shows the results.", "Count the rows where passed = 0."] },
  q2: { hint: "Read the test_name of the row where passed = 0.",
    steps: ["Run sql/04_dq_tests.sql.", "Select test_name from #dq_test_result.", "Keep the latest run and passed = 0.", "Type the test_name.", "Compare with lesson 7: which rows cause the failure?"] },

  /* ---------- Think scenarios: run-it drills ---------- */
  tk1run: { hint: "Run the scenario SQL. Order by pct_4h, lowest first. Skip the 'Other (small)' row.",
    steps: ["Copy the SQL from section 4 of the scenario.", "Run it in the window where you ran sql/01 and sql/02.", "Read the rows from the top. Skip 'Other (small)': it is a group of small practices, not one practice.", "Type the practice code of the first real practice."] },
  tk2run: { hint: "Run sql/03_gold.sql first, then the waterfall. Read step 7.",
    steps: ["Run sql/03_gold.sql in this window (after 01 and 02).", "Run the waterfall query from section 4.", "Read the n value in the row where step = 7."] },
  tk6run: { hint: "Look at the change_lag buckets. Add the rows in the buckets above 7 days.",
    steps: ["Run the first query in section 4.", "Read the buckets '8-14 days' and '15+ days'.", "Add them. A bucket that is not in the result has 0 rows."] },
  tk7run: { hint: "Run the occupancy query with @as_of = '20260115 21:00'. Count the rows.",
    steps: ["Run the SQL from section 4 without changes.", "Count the rows in the result.", "Optional: remove the 12-hour condition to see everyone in the department at that time."] }
};

/* Think drills without a checked answer: one general method. */
window.THINK_HELP = {
  hint: "Use the six questions: decision, definition, grain, source, failure, governance. Which one does this situation test?",
  steps: [
    "Read the request again. Underline the words that are not defined.",
    "Pick the one of the six questions that the situation tests most.",
    "Write what could go wrong if you do not ask that question.",
    "Write what you would do first. Use one sentence for each action.",
    "Compare with the model answer. Mark what you missed."
  ]
};

/* Common SQL Server error messages, explained in STE. */
window.SQL_ERRORS = [
  { msg: "Msg 207: Invalid column name 'x'.", cause: "The column does not exist in the table or the alias that you used.",
    fix: ["Check the spelling. Column names in dbo.ED_sandpit are case-sensitive in some collations.", "Check the alias: r.Sex is valid only if the table has the alias r.", "You cannot use a SELECT alias in WHERE. Repeat the expression, or use a CTE."] },
  { msg: "Msg 208: Invalid object name '#silver_attendance'.", cause: "The temp table does not exist in THIS query window. Temp tables (#name) live only in the window that made them.",
    fix: ["Did you open a new window, or reconnect? Run sql/run_all_in_this_window.sql again in this window (about 10 seconds).", "Each lesson shows the scripts it needs in the 'Before you run this' box.", "Check the name: #silver_attendance, #ref_ethnic_category. Not silver.attendance, not r.ethnic_category.", "A table alias (r, a, e) is not a table name. Write the full name in FROM and JOIN. Use the alias only before column names.", "Check that the table exists in this window: SELECT OBJECT_ID('tempdb..#silver_attendance'); NULL means it is not there."] },
  { msg: "Msg 208: Invalid object name 'dbo.ED_sandpit'.", cause: "The query window is connected to the wrong database.",
    fix: ["Select the database that holds dbo.ED_sandpit in the SSMS toolbar list.", "Or put USE <database name>; at the top of the window."] },
  { msg: "Msg 262 / Msg 2760: CREATE ... permission denied, or the schema does not exist.", cause: "You ran a script that creates permanent objects. Your login cannot do that.",
    fix: ["Use the scripts in the sql/ folder. They create temp tables only.", "The scripts in sql/reference_only/ are for reading. They need permissions that analysts do not usually have."] },
  { msg: "Msg 2714: There is already an object named 'x' in the database.", cause: "A temp table or a named constraint already exists.",
    fix: ["Run DROP TABLE IF EXISTS #x; before CREATE TABLE #x.", "Do not give names to constraints on temp tables. Another window can use the same name."] },
  { msg: "Msg 130: Cannot perform an aggregate function on an expression containing an aggregate or a subquery.", cause: "A subquery (for example NOT EXISTS (...)) or an aggregate is inside SUM, COUNT or AVG.",
    fix: ["Move the subquery test to the WHERE clause, then use COUNT(*).", "Or calculate the flag first in a CTE or CROSS APPLY. Then SUM the flag column."] },
  { msg: "Msg 1913: The operation failed because an index or statistics with name 'x' already exists.", cause: "You ran CREATE INDEX a second time.",
    fix: ["Write DROP INDEX IF EXISTS x ON table; before CREATE INDEX.", "The lesson queries do this, so they are safe to run again."] },
  { msg: "Msg 50001: One or more data-quality tests failed.", cause: "sql/04_dq_tests.sql (with @fail_on_error = 1) found a failed test and stopped the job. This is the guard working, not a bug in your SQL.",
    fix: ["Read the failed test: SELECT * FROM #dq_test_result WHERE passed = 0;", "In this practice data one test fails on purpose (lesson 16, drill q1).", "To run the tests without stopping, use @fail_on_error = 0."] },
  { msg: "Msg 8120: Column 'x' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.",
    cause: "The query groups rows, but one column in SELECT is not in GROUP BY and is not inside COUNT, SUM, MIN or MAX.",
    fix: ["Add the column to GROUP BY.", "Or put the column inside an aggregate, for example MAX(x).", "Or remove the column from SELECT."] },
  { msg: "Msg 102: Incorrect syntax near 'x'.", cause: "SQL Server cannot read the statement near the word in the message.",
    fix: ["Look at the line before the word. A comma or a bracket is often missing.", "Check that every '(' has a ')'.", "Check that text values use single quotes, not double quotes."] },
  { msg: "Msg 319: Incorrect syntax near the keyword 'with'. If this statement is a common table expression … the previous statement must be terminated with a semicolon.",
    cause: "A CTE (WITH ...) follows another statement that has no semicolon.",
    fix: ["Put a semicolon at the end of the statement before WITH.", "Good practice: end every statement with a semicolon."] },
  { msg: "Msg 209: Ambiguous column name 'x'.", cause: "Two tables in the join have a column with this name.",
    fix: ["Put the table alias before the column: a.attendance_id.", "Give every table an alias in every join."] },
  { msg: "Msg 8134: Divide by zero error encountered.", cause: "The denominator is 0 for at least one group.",
    fix: ["Use NULLIF(denominator, 0). The result is NULL, not an error.", "Check why the group has no rows."] },
  { msg: "Msg 241 / 242: Conversion failed when converting date and/or time from character string.",
    cause: "A text value is not a valid date in the format that SQL Server expects.",
    fix: ["Use TRY_CONVERT. It gives NULL for a bad value.", "Give the style number: CONVERT(DATE, census_date, 103) for dd/mm/yyyy.", "Write date literals as 'yyyymmdd', for example '20260115'."] },
  { msg: "Msg 245: Conversion failed when converting the varchar value 'x' to data type int.",
    cause: "SQL Server tried to change text to a number, and one value is not a number.",
    fix: ["Use TRY_CONVERT(INT, x) to find the bad values: they become NULL.", "Compare text with text: write Attendance_Category_Code = '1', not = 1."] },
  { msg: "Msg 468: Cannot resolve the collation conflict.", cause: "You compare two text columns that have different collations.",
    fix: ["Add COLLATE DATABASE_DEFAULT to one side of the comparison.", "This happens when dbo.ED_sandpit was imported with a different collation from the database. The ref tables use the database collation."] },
  { msg: "Msg 4104: The multi-part identifier 'x.y' could not be bound.", cause: "The alias x is not defined in this part of the query.",
    fix: ["Check the alias in the FROM or JOIN line.", "An alias inside a subquery is not visible outside it."] },
  { msg: "Msg 4145: An expression of non-boolean type specified in a context where a condition is expected.",
    cause: "WHERE, ON or IIF needs a test that is true or false, for example x = 1.",
    fix: ["Write a full comparison: WHERE is_weekend = 1, not WHERE is_weekend.", "Check for a missing '=' or 'IS NULL'."] },
  { msg: "The query runs but the number is wrong.", cause: "The SQL is valid, but the logic does not match the question.",
    fix: ["Read the question again. Underline every filter: type, dates, table, NULL rule.", "Check the table: dbo.ED_sandpit (raw) or #silver_attendance (clean). They differ by 55 duplicate rows.", "Check the comparison: case-insensitive collation makes 'm' = 'M'.", "Check COUNT(*) against COUNT(DISTINCT ...).", "Run the parts of the query one at a time and look at the rows."] }
];
