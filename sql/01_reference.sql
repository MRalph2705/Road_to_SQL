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
