# Production version — read only

The scripts in this folder build the course as a real warehouse would: permanent schemas, tables, a function, stored procedures and a view. **They need permissions that a normal analyst login does not have.** Do not run them unless your DBA has given you those permissions.

The course does not need them. The scripts one level up (`sql/01` to `sql/04`) build the same model with **temporary tables**, which every login can create. Read these files to learn how the permanent version works, and to show a DBA exactly what you would build.

## What each permanent object does, and the workaround the course uses

| Production object | Permission it needs | What the course uses instead |
|---|---|---|
| Schemas `silver`, `gold`, `ref`, `etl`, `dq` (`00_setup.sql`) | `CREATE SCHEMA` | A name prefix on temp tables: `silver.attendance` → `#silver_attendance`, `ref.ethnic_category` → `#ref_ethnic_category`. The prefix keeps the layer visible. |
| Database compatibility level 140 (`00_setup.sql`) | `ALTER` on the database | Nothing. The course queries avoid `STRING_SPLIT` and `OPENJSON`, so any level from 100 works on SQL Server 2017 or later. |
| Lookup tables in `ref` (`01_reference.sql`) | `CREATE TABLE`, `ALTER` on schema `ref` | `#ref_...` temp tables in `sql/01_reference.sql`. |
| Function `etl.fn_nhs_number_check` (`02_silver.sql`) | `CREATE FUNCTION` | The same Modulus 11 rule, calculated once into `#etl_nhs_check` (one row per source row). Lesson 4 also shows the rule as a plain query. |
| Silver tables (`02_silver.sql`) | `CREATE TABLE` | `#silver_attendance`, `#silver_attendance_diagnosis`. |
| Procedure `etl.usp_load_silver_attendance` | `CREATE PROCEDURE` | The procedure body as a plain batch in `sql/02_silver.sql`: same log, transaction, TRY/CATCH and THROW. |
| Table `etl.load_log` | `CREATE TABLE` | `#etl_load_log`. It is created once per window and keeps every run. |
| Gold tables (`03_gold.sql`) | `CREATE TABLE` | `#gold_dim_date`, `#gold_dim_patient`, `#gold_fact_attendance`. |
| View `gold.vw_ed_performance_monthly` | `CREATE VIEW` | The view's query, at the end of `sql/03_gold.sql`. |
| Procedure `etl.usp_load_gold`, table `etl.secret_salt` (`04_load_gold.sql`) | `CREATE PROCEDURE`, `CREATE TABLE` | A plain batch in `sql/03_gold.sql`, and `#etl_secret_salt` (one salt per window). |
| Procedure `dq.usp_run_tests`, table `dq.test_result` (`05_dq_tests.sql`) | `CREATE PROCEDURE`, `CREATE TABLE` | A plain batch in `sql/04_dq_tests.sql`, and `#dq_test_result`. |
| Extended property `MS_Description` (Think 9) | `ALTER` on the table | A description header at the top of each script, and a data dictionary query you can run. |
| `OPENROWSET(BULK ...)` to read a file (Think 5) | `ADMINISTER BULK OPERATIONS` | Paste the file's header line into a variable. |
| Indexes on permanent tables (lesson 14) | `ALTER` on the table | Indexes on the temp table `#silver_attendance`. Any login can index its own temp tables. |

## What changes with temp tables

- **A temp table lives in one query window.** Close the window, or open a new one, and the tables are gone. Run `sql/run_all_in_this_window.sql` again (about 10 seconds). Keep one window for the whole practice session.
- **History resets with the window.** `#etl_load_log`, `#dq_test_result` and the SCD2 history in `#gold_dim_patient` last until you close the window.
- **Pseudo IDs change with the window**, because each window makes a new salt. Counts do not change.
- **No one else can see your temp tables.** That is good for information governance.

## Check your permissions

Run `sql/00_check_access.sql`. It shows 1 or 0 for each permission, and it changes nothing.

## Ask your DBA (template)

> I am practising data engineering on `dbo.ED_sandpit` in `<database>`. I would like a personal schema, for example `sandbox_<username>`, where I can create tables, views, functions and procedures. I need: `CREATE TABLE`, `CREATE VIEW`, `CREATE FUNCTION`, `CREATE PROCEDURE` in the database, and `ALTER` on that schema only. I do not need write access to `dbo` or to any other schema. The scripts I would run are attached (read-only copies in `sql/reference_only/`).

If you get a personal schema, change the schema names in these scripts (`silver.`, `gold.`, `ref.`, `etl.`, `dq.`) to your schema name, for example `sandbox_mralph.silver_attendance`.
