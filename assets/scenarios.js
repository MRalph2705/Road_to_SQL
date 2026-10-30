/* ED SQL - "Think like a data engineer" track.
   Each scenario starts from a realistic request. You answer in three stages:
   1) the questions you ask, 2) a one-page spec, 3) the SQL. Then "what breaks?" drills.
   Explanations follow ASD-STE100 rules. */

window.THINK_FRAMEWORK = {
  intro: [
    "A request is not a specification.",
    "Most wrong numbers come from a wrong definition, not from wrong SQL.",
    "Ask questions before you write code.",
    "Write the answers down. Then build.",
    "After you build, try to break it."
  ],
  questions: [
    { name: "Decision", ask: "What decision will this data support? Who makes the decision, and when?",
      why: "The decision sets the detail, the deadline and the accuracy you need. A board trend and a bed-meeting list are different products." },
    { name: "Definition", ask: "Write the measure in one sentence. Name the numerator, the denominator, the exclusions and the date basis.",
      why: "Two people can say '4-hour performance' and mean different things. One sentence in writing stops the argument later." },
    { name: "Grain", ask: "What does one row mean in the source? What does one row mean in the output?",
      why: "A grain mismatch causes double counting. One patient, one attendance and one diagnosis are three different grains." },
    { name: "Source and lineage", ask: "Where does each field come from? What is the source of truth? Can you trace a number back to raw rows?",
      why: "When someone challenges a number, you must show the path from the published figure to the source rows." },
    { name: "Failure", ask: "What happens if the input is late, empty, duplicated or a different shape? What happens if the job runs twice?",
      why: "Pipelines fail at night. A safe pipeline stops loudly, and it gives the same result when you run it again." },
    { name: "Governance and handover", ask: "Who may see this? What is the minimum data they need? Who supports it when you are not there?",
      why: "Patient data has legal rules. A pipeline that only you understand is a risk to the service." }
  ]
};

window.SCENARIOS = [
/* ------------------------------------------------------------------ 1 */
{
  id: "vague-request", title: "The vague request", skill: "Requirements", needs: ["01","02"],
  from: "ICB performance analyst", channel: "Email",
  request: "Hi, can you get me 4-hour performance by GP practice for last quarter? Need it by Friday for the system meeting. Thanks!",
  diagram: { type: "flow", nodes: ["Request", "Clarifying questions", "Written definition", "Agree", "Build", "Check"],
    caption: "Spend the first 20 minutes on questions. It saves the last 2 days." },
  task: "Write the questions you would send back before you write any SQL.",
  questions: [
    { q: "Which department types: Type 1 only, or all types?", why: "Type 3 units have much higher performance. Mixing them changes the answer by many points." },
    { q: "'Last quarter' - calendar Q3 (Jul–Sep) or financial Q2? By arrival date or departure date?", why: "NHS financial years start in April. Attendances that cross midnight at quarter end move between periods." },
    { q: "GP practice at the time of the attendance, or the patient's current practice?", why: "This decides if you need history (SCD Type 2) or only the latest value." },
    { q: "How do you want attendances with no registered practice or an unknown practice?", why: "They can be 3–5% of activity. Dropping them silently makes every practice look different from the total." },
    { q: "What do you want for practices with very few attendances?", why: "Small numbers can identify patients, and a percentage from 4 attendances means nothing. You need a suppression rule and a minimum count." },
    { q: "What decision will the meeting make with this?", why: "If the aim is to find practices whose patients wait longest, a ranked table with counts and confidence is better than a bare percentage." },
    { q: "Will this be shared outside the ICB?", why: "It decides the IG route and the level of suppression." }
  ],
  spec: [
    "Purpose: show which practices' registered patients have the lowest 4-hour performance, for the system UEC meeting.",
    "Population: Type 1 attendances at the trust, arrival date 1 July to 30 September 2026 inclusive.",
    "Measure: % of attendances with departure within 4:00:00 of arrival. Numerator and denominator shown.",
    "Practice: practice recorded on the attendance (at the time).",
    "Exclusions: missing or negative duration (count reported separately). Unknown practice shown as one row.",
    "Disclosure: practices with fewer than 10 attendances grouped as 'Other (small)'. This also removes counts under 5.",
    "Output: one table, practice code, attendances, within 4h, %, rank. Delivered Thursday for review.",
    "Owner: [your name]. Definition agreed with: [analyst], [date]."
  ],
  sql: `DECLARE @from DATE = '20260701', @to DATE = '20261001';   -- half-open range
DECLARE @min_n INT = 10;

WITH base AS (
    SELECT COALESCE(a.gp_practice_code, 'Unknown') AS gp_practice_code,
           CASE WHEN a.departure_dttm >= a.arrival_dttm
                THEN IIF(DATEDIFF(SECOND, a.arrival_dttm, a.departure_dttm) <= 14400, 1, 0) END AS within_4h
    FROM #silver_attendance AS a
    WHERE a.dept_type = 1
      AND a.arrival_dttm >= @from AND a.arrival_dttm < @to
), by_practice AS (
    SELECT CASE WHEN COUNT(within_4h) >= @min_n THEN gp_practice_code ELSE 'Other (small)' END AS practice,
           COUNT(within_4h) AS attendances,
           SUM(within_4h)   AS within_4h,
           COUNT(*) - COUNT(within_4h) AS excluded_no_duration
    FROM base
    GROUP BY gp_practice_code
)
SELECT practice,
       SUM(attendances) AS attendances,
       SUM(within_4h)   AS within_4h,
       CAST(100.0 * SUM(within_4h) / NULLIF(SUM(attendances), 0) AS DECIMAL(5,1)) AS pct_4h,
       SUM(excluded_no_duration) AS excluded_no_duration
FROM by_practice
GROUP BY practice
ORDER BY pct_4h;`,
  drills: [
    { id: "tk1run", q: "Run the scenario SQL (Type 1, July to September 2026). Ignore the 'Other (small)' row. Which practice has the lowest 4-hour performance? Type the practice code.", ans: "P81016", fmt: "a practice code",
      hint: "Its performance is 59.3%.",
      sql: `-- The scenario query, cut down to one answer.
DECLARE @from DATE = '20260701', @to DATE = '20261001';
DECLARE @min_n INT = 10;

WITH base AS (
    SELECT COALESCE(a.gp_practice_code, 'Unknown') AS gp_practice_code,
           CASE WHEN a.departure_dttm >= a.arrival_dttm
                THEN IIF(DATEDIFF(SECOND, a.arrival_dttm, a.departure_dttm) <= 14400, 1, 0) END AS within_4h
    FROM #silver_attendance AS a
    WHERE a.dept_type = 1
      AND a.arrival_dttm >= @from AND a.arrival_dttm < @to
), by_practice AS (
    SELECT gp_practice_code,
           100.0 * SUM(within_4h) / NULLIF(COUNT(within_4h), 0) AS pct_4h
    FROM base
    GROUP BY gp_practice_code
    HAVING COUNT(within_4h) >= @min_n          -- the small practices form 'Other (small)'
)
SELECT TOP (1) gp_practice_code
FROM by_practice
ORDER BY pct_4h, gp_practice_code;` },
    { id: "tk1a", q: "The analyst replies: 'Just all types, whatever is easiest.' What do you do?",
      a: "Do not accept 'whatever is easiest' for a definition. Give two options with the effect of each, for example: 'All types gives 78%, Type 1 gives 64%. National tables show both. Which one matches the meeting paper?' Then write the answer in the spec." },
    { id: "tk1b", q: "Your total across all practices does not match the trust's published Type 1 figure. Give three possible reasons.",
      a: "1. Your exclusions (missing departure) differ from the published method. 2. The period basis differs (arrival vs departure date, or the publication was refreshed). 3. 'Other (small)' or 'Unknown' rows were dropped somewhere. Always reconcile the total before you show the breakdown." }
  ]
},
/* ------------------------------------------------------------------ 2 */
{
  id: "doesnt-match", title: "\"Your number doesn't match\"", skill: "Reconciliation and lineage", needs: ["01","02","03"],
  from: "Deputy COO", channel: "Teams message, 8:40 am",
  request: "Board pack says 71.8% for March. NHS England's published figure for us is 73.1%. Which one is right? Board is at 10.",
  diagram: { type: "flow", nodes: ["Published figure", "Definitions", "Population waterfall", "Find the gap", "Explain in writing"],
    caption: "Do not guess. Walk the population from raw rows to the final number, one filter at a time." },
  task: "Write your first three steps. You have 80 minutes.",
  questions: [
    { q: "Which published series is it: the monthly SitRep (MSitAE) or the ECDS supplementary analysis?", why: "They come from different collections and can differ. You must compare like with like." },
    { q: "All types or Type 1? Does the published figure include other providers or UTCs run by partners?", why: "The trust's SitRep can include activity from units that are not in your extract." },
    { q: "When did each figure take its data snapshot?", why: "Late-coded records and resubmissions change the numbers after the first run." }
  ],
  spec: [
    "Step 1: confirm both figures use the same series, type and month. Write both definitions side by side.",
    "Step 2: run the population waterfall: raw rows → de-duplicated → valid arrival → in period → with duration → within 4h.",
    "Step 3: find the step where the counts diverge from the published numerator and denominator.",
    "Step 4: send a short written answer: which figure, why they differ, and the size of each reason.",
    "Rule: never change a published board number at 9:55. Give the explanation and fix it in the next pack."
  ],
  sql: `-- Population waterfall: each step shows how many rows survive.
SELECT 1 AS step, 'Rows in dbo.ED_sandpit'                 AS stage, COUNT(*)              AS n FROM dbo.ED_sandpit
UNION ALL
SELECT 2, 'Distinct episodes (AE_Episode_Number)',                   COUNT(DISTINCT AE_Episode_Number) FROM dbo.ED_sandpit
UNION ALL
SELECT 3, 'Silver (after near-duplicate removal)',                   COUNT(*)                   FROM #silver_attendance
UNION ALL
SELECT 4, 'Silver with valid arrival, not in future',                COUNT(*)                   FROM #silver_attendance
    WHERE arrival_dttm IS NOT NULL AND arrival_dttm <= SYSUTCDATETIME()
UNION ALL
SELECT 5, 'Gold fact rows',                                          COUNT(*)                   FROM #gold_fact_attendance
UNION ALL
SELECT 6, 'Gold rows with a 4-hour result',                          COUNT(within_4h)           FROM #gold_fact_attendance
UNION ALL
SELECT 7, 'Within 4 hours',                                          SUM(CAST(within_4h AS INT)) FROM #gold_fact_attendance
ORDER BY step;`,
  drills: [
    { id: "tk2run", q: "Run the waterfall after the gold load. What is the number at step 7 (within 4 hours, all types)?", ans: 13623,
      sql: `-- Step 7 of the waterfall on its own:
SELECT SUM(CAST(within_4h AS INT)) AS within_4h
FROM #gold_fact_attendance;` },
    { id: "tk2a", q: "Step 1 to step 2 drops 55 rows. How do you prove they are true duplicates and not real attendances?",
      a: "Sample them. For 10–20 of the dropped rows, show the kept row and the dropped row side by side. Check that patient, arrival and clinical content match. Ask the system owner why the source created two IDs. Record the answer as a known issue." },
    { id: "tk2b", q: "Why is a waterfall better than one count at the end?",
      a: "One count tells you there is a gap. A waterfall tells you where the gap is. Each step has one filter, so each difference has one reason." }
  ]
},
/* ------------------------------------------------------------------ 3 */
{
  id: "run-twice", title: "The job ran twice", skill: "Idempotency and re-runs", needs: ["01","02"],
  from: "Server team", channel: "Ticket",
  request: "The SQL Agent job restarted after patching at 02:00 and ran the ED load a second time. Please confirm the data is OK.",
  diagram: { type: "loop", nodes: ["Run load", "Measure", "Run load again", "Measure again", "Same? idempotent"], highlight: 4,
    caption: "Idempotent: running a load two times gives the same result as running it one time." },
  task: "How do you confirm it? What design makes this question easy?",
  questions: [
    { q: "Which procedures ran twice: silver only, or silver and gold?", why: "Each step can be safe or unsafe on its own." },
    { q: "Does any step append rows (INSERT without delete)?", why: "Append-only steps double the data when they run twice. Truncate-and-load and delete-then-insert steps do not." },
    { q: "Did any downstream extract or email go out between the two runs?", why: "If the first run was wrong, someone may already have the wrong numbers." }
  ],
  spec: [
    "Design rule: every load must be idempotent.",
    "Full loads: TRUNCATE then INSERT inside one transaction.",
    "Incremental loads: DELETE the target window (or key set), then INSERT the same window.",
    "Never use plain INSERT of 'new' rows without a key check.",
    "Test: run each load two times in test. Compare row count and a checksum of business columns."
  ],
  sql: `-- Idempotency test for the silver load. Use one query window.
-- 1. Run sql/02_silver.sql.   2. Run this query.
-- 3. Run sql/02_silver.sql again.   4. Run this query again.
IF OBJECT_ID(N'tempdb..#idempotency') IS NULL
    CREATE TABLE #idempotency (run INT IDENTITY(1,1), n INT, chk INT);

INSERT #idempotency (n, chk)
SELECT COUNT(*), CHECKSUM_AGG(CHECKSUM(attendance_id, nhs_number, arrival_dttm, departure_dttm, dq_flags))
FROM #silver_attendance;

SELECT run, n, chk,
       CASE WHEN COUNT(*) OVER () < 2 THEN 'Now run sql/02_silver.sql again, then this query again'
            WHEN MIN(n) OVER () = MAX(n) OVER () AND MIN(chk) OVER () = MAX(chk) OVER ()
            THEN 'Idempotent' ELSE 'NOT idempotent' END AS result
FROM #idempotency
ORDER BY run;

-- Safe incremental pattern: delete-then-insert one window
-- BEGIN TRAN;
--   DELETE FROM #silver_attendance WHERE arrival_dttm >= @from AND arrival_dttm < @to;
--   INSERT #silver_attendance (...) SELECT ... WHERE arrival_dttm >= @from AND arrival_dttm < @to;
-- COMMIT;`,
  drills: [
    { id: "tk3a", q: "Why does the checksum leave out load_dttm?",
      a: "load_dttm changes on every run by design. If you include it, the checksum always differs, and the test fails even when the data is the same. Compare business columns only." },
    { id: "tk3b", q: "The gold SCD2 step ran twice. Is #gold_dim_patient still correct? Explain why.",
      a: "Yes. The second run finds no changed rows (EXCEPT returns nothing), so it closes nothing. It inserts only patients with no current row, and there are none. The filtered unique index also blocks a second current row." }
  ]
},
/* ------------------------------------------------------------------ 4 */
{
  id: "empty-file", title: "The half-empty file", skill: "Failure modes and guards", needs: ["01","02"],
  from: "Nobody (yet)", channel: "07:00, the dashboard",
  request: "Overnight 4-hour performance shows 96%. Yesterday was 68%. Nobody has noticed yet.",
  diagram: { type: "flow", nodes: ["File arrives", "Guard checks", "Pass → load", "Fail → stop + alert", "Yesterday's data stays"],
    caption: "A guard stops a bad file before it replaces good data." },
  task: "What went wrong, and what checks would have stopped it?",
  questions: [
    { q: "How many rows arrived compared with a normal day?", why: "A partial extract often has a fraction of the normal rows, and only the quick, easy attendances." },
    { q: "What is the latest arrival time in the file?", why: "A file that stops at 03:00 is incomplete for the day." },
    { q: "Did the extract job on the source system finish successfully?", why: "The fault is often upstream. Fix the cause, not only the symptom." }
  ],
  spec: [
    "Guard 1: row count must be at least 50% of the average of the last 7 successful loads.",
    "Guard 2: the latest arrival must be within 1 day of the expected extract date.",
    "Guard 3: the header must match the expected 264 columns (see scenario 5).",
    "On failure: THROW, keep yesterday's silver and gold, alert the on-call person.",
    "Never let a failed guard truncate the target tables."
  ],
  sql: `DECLARE @as_of DATETIME2(0) = '20261012';   -- the extract ends 11 Oct 2026; use SYSUTCDATETIME() in production
DECLARE @rows INT = (SELECT COUNT(*) FROM dbo.ED_sandpit);
DECLARE @expected INT =
    (SELECT AVG(rows_read) FROM (SELECT TOP (7) rows_read FROM #etl_load_log
                                 WHERE process_name = 'silver.attendance' AND status = 'Succeeded'
                                 ORDER BY log_id DESC) AS x);
DECLARE @max_arrival DATETIME2(0) =
    (SELECT MAX(Arrived_DTTM) FROM dbo.ED_sandpit WHERE Arrived_DTTM <= @as_of);
DECLARE @msg NVARCHAR(400);

IF @expected IS NOT NULL AND @rows < 0.5 * @expected
BEGIN
    SET @msg = CONCAT('Guard failed: ', @rows, ' rows. Expected about ', @expected, '.');
    THROW 50010, @msg, 1;
END;

IF @max_arrival < DATEADD(DAY, -1, @as_of)
BEGIN
    SET @msg = CONCAT('Guard failed: latest arrival is ', @max_arrival, '.');
    THROW 50011, @msg, 1;
END;

PRINT 'Guards passed. Safe to run sql/02_silver.sql.';`,
  drills: [
    { id: "tk4a", q: "Why is a sudden jump to 96% more dangerous than a load that fails with an error?",
      a: "An error is visible and someone fixes it. A plausible wrong number is silent. People use it, quote it and make decisions with it. Guards turn silent failures into loud ones." },
    { id: "tk4b", q: "Name two more guards you would add for this extract.",
      a: "Examples: no more than 5% of arrivals fail to parse; the share of Type 1 attendances stays within its normal range; the file is not identical to yesterday's file (same checksum); the AE_ID range continues from yesterday." }
  ]
},
/* ------------------------------------------------------------------ 5 */
{
  id: "schema-drift", title: "The supplier changed the file", skill: "Schema drift and data contracts", needs: [],
  from: "EPR supplier release notes", channel: "PDF, page 47",
  request: "Release 12.4: added column Frailty_Score after Weight_Kg. Date fields now use the user's locale format.",
  diagram: { type: "grid", arrow: "column shift",
    before: { cols: ["Weight_Kg", "Sepsis_HighRisk"], rows: [["51.5", "N"]] },
    after:  { cols: ["Weight_Kg", "Sepsis_HighRisk"], rows: [["51.5", "6 ← Frailty_Score"]] },
    caption: "A new column in the middle shifts every later column. BULK INSERT does not notice." },
  task: "What breaks, and how do you find out before the release goes live?",
  questions: [
    { q: "When does the release go live, and can we get a test extract first?", why: "You need a sample file to run your checks against before the change reaches production." },
    { q: "Which date format will the server account use?", why: "'Locale format' could mean dd/mm/yyyy or mm/dd/yyyy. Your parser must not guess." },
    { q: "Is there an agreed file specification (a data contract)?", why: "A contract makes the supplier tell you about changes. Without one, you find out from broken numbers." }
  ],
  spec: [
    "Check the header against the expected column list on every load. Stop on any difference.",
    "Check the share of dates that fail to parse. Stop above a threshold (for example 1%).",
    "Keep the expected column list in a table, under version control.",
    "Ask for a test extract for every supplier release. Run the full pipeline and tests on it.",
    "Agree a data contract: column list, types, formats, notice period for changes."
  ],
  sql: `-- 1. Store the expected header (from the current dbo.ED_sandpit). Read-only: sys.columns.
DROP TABLE IF EXISTS #etl_expected_columns;
SELECT ROW_NUMBER() OVER (ORDER BY c.column_id)          AS ordinal,
       CAST(c.name AS NVARCHAR(128)) COLLATE DATABASE_DEFAULT AS column_name
INTO #etl_expected_columns
FROM sys.columns AS c
WHERE c.object_id = OBJECT_ID(N'dbo.ED_sandpit');

-- 2. Paste the first line of the new file between the quotes.
--    Open the CSV in Notepad and copy line 1. (Reading the file from SQL Server with
--    OPENROWSET(BULK ...) needs a permission that analysts do not usually have.)
--    The example below is short, so every column after it shows as missing.
DECLARE @header NVARCHAR(MAX) = N'AE_ID,NHSNo,Unitno,Title,Forename,Surname,DoB,Gender';
SET @header = REPLACE(REPLACE(REPLACE(@header, '"', ''), CHAR(13), ''), CHAR(10), '');

-- 3. Split the line into (position, name). A recursive CTE works on every version
--    and every compatibility level: it takes one name from the front on each pass.
WITH h AS (
    SELECT 1                                                                          AS ordinal,
           CAST(LEFT(@header, CHARINDEX(',', @header + ',') - 1) AS NVARCHAR(4000))   AS received,
           CAST(STUFF(@header, 1, CHARINDEX(',', @header + ','), '') AS NVARCHAR(MAX)) AS rest
    UNION ALL
    SELECT ordinal + 1,
           CAST(LEFT(rest, CHARINDEX(',', rest + ',') - 1) AS NVARCHAR(4000)),
           CAST(STUFF(rest, 1, CHARINDEX(',', rest + ','), '') AS NVARCHAR(MAX))
    FROM h
    WHERE rest <> ''
)
SELECT COALESCE(e.ordinal, h.ordinal) AS ordinal, e.column_name AS expected, h.received
FROM #etl_expected_columns AS e
FULL JOIN h ON h.ordinal = e.ordinal
WHERE e.column_name IS NULL OR h.received IS NULL
   OR e.column_name <> h.received COLLATE DATABASE_DEFAULT
ORDER BY 1
OPTION (MAXRECURSION 1000);     -- zero rows = header matches`,
  drills: [
    { id: "tk5a", q: "The header check passes, but 4% of dates now fail to parse. What do you do?",
      a: "Stop the load and keep yesterday's data. Look at the failing values. If they are a new, unambiguous format, add a rule to the date conversion in the load and test it. If the format is ambiguous (01/02/2026), do not guess: ask the supplier to send ISO 8601." },
    { id: "tk5b", q: "Why store the expected columns in a table, rather than in your head or in an email?",
      a: "The check can run automatically on every load. The list is versioned, so you can see when it changed and who changed it. Someone else can support the pipeline." }
  ]
},
/* ------------------------------------------------------------------ 6 */
{
  id: "trade-off", title: "Full reload or incremental?", skill: "Trade-offs and design decisions", needs: ["01","02"],
  from: "Your team lead", channel: "1:1",
  request: "The ED load takes 2 minutes now. We're adding five years of history and the inpatient data next month. Should we change the design?",
  diagram: { type: "layers", layers: [
      { name: "Full reload", text: "Simple. Always correct. Cost grows with all history.", tone: "bronze" },
      { name: "Incremental (watermark)", text: "Fast. Needs a reliable modified date and late-change handling.", tone: "silver" },
      { name: "Hybrid", text: "Incremental nightly, full reload weekly to catch missed changes.", tone: "gold" }], arrows: false,
    caption: "There is no best design. There is a best design for these numbers and this risk." },
  task: "What do you need to know before you answer? Write a short decision note.",
  questions: [
    { q: "How many rows will there be, and how many change each day?", why: "If 99% of rows never change, reloading them every night is waste." },
    { q: "Does the source have a reliable last-modified time?", why: "An incremental load depends on it. If coding updates do not change Modif_DTTM, you will miss changes." },
    { q: "How late can a record change? (Coding is often finished days later.)", why: "The incremental window must cover late changes, for example the last 14 days." },
    { q: "What is the load window, and who waits for it?", why: "If reports are needed by 07:00 and the extract lands at 05:00, you have 2 hours, including a re-run." }
  ],
  spec: [
    "Decision note (one page): context, options, numbers, decision, risks, review date.",
    "Context: 20k rows/6 months now; ~1M rows with 5 years; ~2k rows change per day.",
    "Option chosen: hybrid. Nightly delete-then-insert of the last 14 days of arrivals. Full reload on Sunday.",
    "Why: keeps nightly run short; the weekly full reload catches changes outside the window.",
    "Risk: changes older than 14 days are up to 7 days late. Accepted by the performance team.",
    "Measure: load time and row counts from #etl_load_log. Review in 3 months."
  ],
  sql: `-- Evidence for the decision: how old are the changes?
SELECT
    CASE WHEN days_late <= 1 THEN '0-1 days' WHEN days_late <= 7 THEN '2-7 days'
         WHEN days_late <= 14 THEN '8-14 days' ELSE '15+ days' END AS change_lag,
    COUNT(*) AS row_count
FROM (
    SELECT DATEDIFF(DAY, Arrived_DTTM, Modif_DTTM) AS days_late
    FROM dbo.ED_sandpit
) AS x
WHERE days_late IS NOT NULL
GROUP BY CASE WHEN days_late <= 1 THEN '0-1 days' WHEN days_late <= 7 THEN '2-7 days'
              WHEN days_late <= 14 THEN '8-14 days' ELSE '15+ days' END
ORDER BY MIN(days_late);

-- Load duration trend
SELECT CAST(started_dttm AS DATE) AS run_date, rows_read, DATEDIFF(SECOND, started_dttm, ended_dttm) AS seconds
FROM #etl_load_log WHERE status = 'Succeeded' ORDER BY log_id DESC;`,
  drills: [
    { id: "tk6run", q: "Run the first query in section 4. How many rows were last modified more than 7 days after arrival?", ans: 0,
      hint: "Every change arrives within 7 days. So a nightly reload of the last 14 days of arrivals catches all of them, with a margin.",
      sql: `-- The '8-14 days' and '15+ days' buckets together:
SELECT COUNT(*) AS modified_after_7_days
FROM dbo.ED_sandpit
WHERE DATEDIFF(DAY, Arrived_DTTM, Modif_DTTM) > 7;` },
    { id: "tk6a", q: "Your lead says: 'Just make it incremental, it's faster.' What do you reply?",
      a: "Agree on the goal (speed), then give the evidence and the risk: 'Incremental is faster, but X% of changes arrive more than 14 days late. If we only load a window, those changes are missed. A weekly full reload covers that. Here are the numbers.' Decide with data, write it down." },
    { id: "tk6b", q: "Why add a review date to a design decision?",
      a: "The numbers change: volumes grow and sources change. A review date makes someone check that the decision is still right, instead of keeping it out of habit." }
  ]
},
/* ------------------------------------------------------------------ 7 */
{
  id: "urgent-list", title: "\"I need a list of patients now\"", skill: "Right tool, minimum data", needs: ["01","02"],
  from: "Site manager", channel: "Phone call, 21:00",
  request: "Can you send me a list of everyone who's been in ED over 12 hours right now, with names and NHS numbers? Email is fine.",
  diagram: { type: "flow", nodes: ["Urgent request", "Is the warehouse the right tool?", "Minimum data", "Secure route", "Record the decision"],
    caption: "Urgent does not cancel the rules. It makes them more important." },
  task: "What do you say, and what (if anything) do you build?",
  questions: [
    { q: "What do you need to do with the list tonight?", why: "Usually: find and move patients. That needs location and wait time, not a spreadsheet of identifiers." },
    { q: "Do you have access to the live ED board in the EPR?", why: "The warehouse loads at night. 'Right now' data is in the live system, not in silver." },
    { q: "If a list is still needed: can it go through secure NHSmail, or be viewed on screen only?", why: "Patient-identifiable data must use an approved secure route, and only the minimum fields." }
  ],
  spec: [
    "Say clearly: the warehouse is yesterday's data. The live ED board shows 'right now'.",
    "Point the site manager to the live board, or ask the ED coordinator to read it.",
    "If a list is agreed: minimum fields (location, arrival time, hours waited, bed request). No names in email.",
    "Use the approved secure route only. Record who asked, what was sent and why.",
    "Next day: propose a proper live report so the request does not repeat."
  ],
  sql: `-- Point-in-time occupancy: who was in the department at @as_of, and for how long?
-- (Training query on yesterday's data. It is not a live list.)
DECLARE @as_of DATETIME2(0) = '20260115 21:00';

SELECT a.attendance_id,
       a.dept_type,
       a.arrival_dttm,
       CAST(DATEDIFF(MINUTE, a.arrival_dttm, @as_of) / 60.0 AS DECIMAL(5,1)) AS hours_in_dept,
       CASE WHEN a.decision_to_admit_dttm <= @as_of THEN 'Waiting for bed' ELSE 'In assessment' END AS status
FROM #silver_attendance AS a
WHERE a.arrival_dttm <= @as_of
  AND (a.departure_dttm > @as_of
       OR (a.departure_dttm IS NULL AND a.arrival_dttm > DATEADD(HOUR, -72, @as_of)))  -- cap bad records
  AND DATEDIFF(SECOND, a.arrival_dttm, @as_of) > 43200
ORDER BY a.arrival_dttm;`,
  drills: [
    { id: "tk7run", q: "Run the query in section 4. How many patients had been in the department for more than 12 hours at 21:00 on 15 January 2026?", ans: 1,
      hint: "Remove the 12-hour condition and 18 patients were in the department at that time.",
      sql: `DECLARE @as_of DATETIME2(0) = '20260115 21:00';

SELECT COUNT(*) AS over_12h_at_2100
FROM #silver_attendance AS a
WHERE a.arrival_dttm <= @as_of
  AND (a.departure_dttm > @as_of
       OR (a.departure_dttm IS NULL AND a.arrival_dttm > DATEADD(HOUR, -72, @as_of)))
  AND DATEDIFF(SECOND, a.arrival_dttm, @as_of) > 43200;` },
    { id: "tk7a", q: "Why does the query cap records with no departure at 72 hours?",
      a: "A missing departure is usually a data error, not a patient who is still in the department weeks later. Without a cap, every bad record looks like a current 12-hour wait, and the list is wrong." },
    { id: "tk7b", q: "The caller is senior and says: 'Just send it, I'll take responsibility.' What do you do?",
      a: "Stay polite and firm. Offer the fastest safe option (live board, a call to the ED coordinator, a minimal list through the secure route). Explain that the rules protect patients and staff. Escalate to the on-call manager or IG lead if needed. Record the decision." }
  ]
},
/* ------------------------------------------------------------------ 8 */
{
  id: "metric-drop", title: "Ethnicity completeness fell overnight", skill: "Investigating anomalies", needs: ["01"],
  from: "Data quality dashboard", channel: "Automated alert",
  request: "ALERT: Ethnicity completeness 71.2% (yesterday 94.8%, threshold 90%).",
  diagram: { type: "tree", levels: [["Metric dropped"], ["Real change in the source", "Pipeline problem"], ["New staff / process", "Upstream code change", "Mapping / load bug", "Partial file"]], highlight: [],
    caption: "First split the cause: is the world different, or is the pipeline different?" },
  task: "Write your investigation plan, in order.",
  questions: [
    { q: "Did the raw values change, or only the cleaned result?", why: "Compare dbo.ED_sandpit with silver. If the raw values are fine and silver is not, the fault is in your code or lookup." },
    { q: "Is the drop in all rows, or in one site, team or user?", why: "A drop in one group points to a process change, for example a new receptionist or a new form." },
    { q: "Did anything change yesterday: a release, a lookup table, a load procedure?", why: "Most sudden drops follow a change. Check the change log first." }
  ],
  spec: [
    "1. Confirm the alert: recompute the metric by hand from silver.",
    "2. Compare raw values in dbo.ED_sandpit for yesterday and the day before. Look for new values (for example lower case 'a').",
    "3. Split by registering user and by department.",
    "4. Check recent changes: supplier release, ref tables, procedures (Git log).",
    "5. Decide where to fix: upstream (process or system) or in the warehouse mapping. Do not hide a real data problem with a mapping.",
    "6. Write a short incident note: cause, impact, fix, prevention."
  ],
  sql: `-- Raw value distribution by day and registering user
SELECT
    r.Arrived_DT AS arrival_date,
    r.User_Create,
    COUNT(*) AS row_count,
    CAST(100.0 * AVG(CASE WHEN e.ethnic_code IS NOT NULL AND e.ethnic_code NOT IN ('Z','99') THEN 1.0 ELSE 0 END)
         AS DECIMAL(5,1)) AS pct_known,
    STRING_AGG(CASE WHEN e.ethnic_code IS NULL THEN CAST(COALESCE(r.Eth_Group_Code, '(missing)') AS NVARCHAR(MAX)) END, ',') AS bad_values
FROM dbo.ED_sandpit AS r
LEFT JOIN #ref_ethnic_category AS e
       ON e.ethnic_code = r.Eth_Group_Code COLLATE Latin1_General_CS_AS
WHERE r.Arrived_DTTM >= '20260901'
GROUP BY r.Arrived_DT, r.User_Create
ORDER BY arrival_date DESC, pct_known;`,
  drills: [
    { id: "tk8a", q: "You find that the new values are lower-case 'a', 'b' and 'c'. Should you add UPPER() to the load?",
      a: "Possibly, but first ask why they changed. If a supplier release changed the format, UPPER() is a sensible, documented mapping and you tell the supplier. If staff are typing codes by hand, the real fix is upstream (a drop-down list). Never silently 'fix' data that hides a process problem." },
    { id: "tk8b", q: "Why check the change log before you dig into the data?",
      a: "Most sudden changes have a recent cause. A 2-minute look at releases and code commits often finds it. Digging into data first can take hours." }
  ]
},
/* ------------------------------------------------------------------ 9 */
{
  id: "handover", title: "Can someone else run this?", skill: "Documentation and handover", needs: [],
  from: "Your manager", channel: "Before your annual leave",
  request: "You're off for two weeks. If the ED load breaks, can Sam fix it without calling you?",
  diagram: { type: "flow", nodes: ["Design note", "Runbook", "Table descriptions", "Tests", "Sam can support it"],
    caption: "A pipeline is finished when someone else can support it." },
  task: "List what Sam needs. Then write one table description: as a header at the top of the script, or in the database if you have ALTER permission.",
  questions: [
    { q: "What does Sam already know about SQL Server and this data?", why: "Write for the reader. A runbook for a DBA and a runbook for an analyst are different." },
    { q: "What are the three most likely failures?", why: "A runbook that covers the common failures well is better than one that covers everything badly." },
    { q: "Who can Sam escalate to?", why: "Name a person and a route for supplier, server and IG problems." }
  ],
  spec: [
    "Design note: purpose, sources, layers, grain of each table, key definitions, decisions and why.",
    "Runbook: schedule, how to check success (#etl_load_log, #dq_test_result), the top 3 failures and the fix for each, how to re-run safely.",
    "Table and column descriptions in the database (extended properties), so they appear in tools. This needs ALTER permission. Without it: a description header in every script, and a generated data dictionary kept with the code.",
    "Contacts: supplier support, server team, IG lead, the performance team owner.",
    "Test it: ask Sam to do one re-run from the runbook while you watch. Fix the gaps."
  ],
  sql: `-- Production writes the grain into the table itself, as an extended property:
--   EXEC sys.sp_addextendedproperty @name = N'MS_Description',
--        @value = N'One row per ED attendance. ...',
--        @level0type = N'SCHEMA', @level0name = N'silver',
--        @level1type = N'TABLE',  @level1name = N'attendance';
-- That needs ALTER permission on the table. Two things need no permission:
--   1. A description header at the top of every script: the grain, the source, the key,
--      the rules and the run order. See the top of sql/02_silver.sql.
--   2. A data dictionary that you generate from the catalogue and keep with your code.

-- Data dictionary for the source table: one row per column, with type and size.
SELECT c.column_id,
       c.name                                                       AS column_name,
       TYPE_NAME(c.user_type_id)                                    AS data_type,
       IIF(c.max_length = -1, 'max', CAST(c.max_length AS VARCHAR(10))) AS max_bytes,
       c.is_nullable
FROM sys.columns AS c
WHERE c.object_id = OBJECT_ID(N'dbo.ED_sandpit')
ORDER BY c.column_id;

-- Descriptions that someone already wrote on tables you can read (read access is enough).
SELECT s.name AS schema_name, t.name AS table_name, CAST(ep.value AS NVARCHAR(4000)) AS description
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
LEFT JOIN sys.extended_properties AS ep
       ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
ORDER BY s.name, t.name;`,
  drills: [
    { id: "tk9a", q: "Write the three runbook entries for the most likely failures of this pipeline.",
      a: "1. File missing or late: check the source extract job; when the file arrives, run the guards, then the loads. 2. Guard or test failure: read the message and #dq_test_result; do not force the load; contact the owner; leave yesterday's data. 3. Load procedure error: read #etl_load_log.error_message; the transaction rolled back, so re-run after the fix. Each entry: symptom, check, action, who to call." },
    { id: "tk9b", q: "Why write the grain in the table description?",
      a: "The grain is the most important fact about a table and the most common cause of wrong numbers. Putting it on the table means every user sees it, not only people who read the design note." }
  ]
}
];
