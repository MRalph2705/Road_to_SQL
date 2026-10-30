# ED SQL

Daily T-SQL practice for an aspiring NHS data engineer, built on `dbo.ED_sandpit`: 20,000 emergency department attendances (Oct 2025 – Oct 2026, 264 ECDS-style columns) with real data-quality problems.

You write each query in SSMS against your own SQL Server, then type the result into the site. The site checks it against answers computed from the full extract.

**Method**
- **3Blue1Brown:** picture first, then a "pause and ponder" question, then the rule.
- **Karpathy:** every explanation is in ASD-STE100 Simplified Technical English, and every drill has a verifier — keep only what a check confirms.
- **Think like a data engineer:** nine scenarios built on six questions (decision, definition, grain, source, failure, governance). One Think drill is in every daily set.
- **Help when stuck:** every drill has a hint → method → answer ladder, plus a button that builds an STE-style prompt for an AI tutor from your query and error.
- **Spaced repetition:** a correct drill returns after 3, 7, 14, 30 and 60 days; a wrong one returns tomorrow. Each daily set always has new drills, and **New set**, **Skip** and **+ 5 more** let you change it.

## What is in the repo

| Path | What it does |
|---|---|
| `index.html`, `assets/` | The website (no build step). Works on GitHub Pages and from a local file. |
| `assets/lessons.js` | 16 lessons: diagram, question, STE explanation, procedure, query, video, and drills with checked answers. |
| `assets/help.js` | Help for every drill: hint, step-by-step method in ASD-STE100, and the SQL Server error guide. |
| `assets/scenarios.js` | The Think track: 9 realistic requests with clarifying questions, a one-page spec, SQL and "what breaks?" drills. |
| `sql/00_check_access.sql` | Read only. Checks `dbo.ED_sandpit`, your version, collation and permissions. Changes nothing. |
| `sql/01_reference.sql` | Lookup tables as temp tables (`#ref_...`). |
| `sql/02_silver.sql` | NHS number check (`#etl_nhs_check`), the silver load (`#silver_attendance`, `#silver_attendance_diagnosis`) and its log (`#etl_load_log`). |
| `sql/03_gold.sql` | Star schema as temp tables: calendar, SCD2 patient dimension, pseudonymised fact, monthly 4h/12h query. |
| `sql/04_dq_tests.sql` | Data-quality tests that pass or fail (`#dq_test_result`). |
| `sql/run_all_in_this_window.sql` | 01 to 04 in one file. Run it at the start of each practice session. Generated. |
| `sql/98_check_answers.sql` | Runs the answer query of every drill and compares it with the stored answer: one PASS / FAIL / ERROR row per drill. Generated. |
| `sql/99_check_all_queries.sql` | The build, then every query on the site, with the expected answers. Generated. |
| `sql/reference_only/` | The production version with permanent schemas, a function, procedures and a view. **Read only**: it needs permissions analysts do not usually have. Its README explains each object and has a template to ask your DBA. |
| `tools/gen_check_script.js` | Rebuilds the two generated SQL files. |

## Quick start (no special permissions)

1. SQL Server 2017 or later, and read access to `dbo.ED_sandpit`. Nothing else.
2. First time only: run `sql/00_check_access.sql`. The last result must say "Temp tables work".
3. Every practice session: open **one** new query window on the database that holds `dbo.ED_sandpit`, run `sql/run_all_in_this_window.sql` (about 10 seconds), then do the lessons in that same window.
4. The scripts make temporary tables (`#name`). They need no permissions and are deleted when you close the window. New window? Run the build again.
5. Optional: run `sql/98_check_answers.sql` in a new window. The last result shows PASS, FAIL or ERROR for every drill's stored answer. `sql/99_check_all_queries.sql` runs every lesson query too.

## Troubleshooting

- **Msg 208 Invalid object name `#silver_attendance`** (or any `#...` table): this query window has no temp tables. Run `sql/run_all_in_this_window.sql` in this window. A table alias such as `r` is not a table name: write `#ref_ethnic_category`, not `r.ethnic_category`.
- **Msg 208 Invalid object name `dbo.ED_sandpit`**: the window is on the wrong database. Pick it in the SSMS toolbar.
- **Msg 262 / 2760 permission denied**: you ran a script from `sql/reference_only/`. Use the scripts in `sql/` instead.
- **Msg 468 collation conflict**: the scripts use `COLLATE DATABASE_DEFAULT`. Add it to your own joins between `dbo.ED_sandpit` and a `#ref_` table.

## Regenerate the generated scripts

After you change `sql/01`–`04`, `assets/lessons.js` or `assets/scenarios.js`, run `node tools/gen_check_script.js .`

## Publish on GitHub Pages

1. Create a public repository and upload the contents of this folder (`index.html` at the top level).
2. Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Open `https://<your-user>.github.io/<repo>/`.

## Data safety

Do not upload `ED_Sandpit.csv` or any patient-level extract. The site holds only counts and percentages. Keep the pseudonymisation salt in the database, not in Git.
