/* ED SQL - single-page app. No build step. No external JS. */
(function () {
  "use strict";
  const L = window.LESSONS || [];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ================= progress store (this browser only) ================= */
  const STORE = "edgym.v1";
  const INTERVALS = [0, 3, 7, 14, 30, 60]; // Leitner boxes, in days. A wrong answer always comes back tomorrow.
  const SET_SIZE = 5, NEW_SLOTS = 2;        // each set keeps at least 2 places for drills you have not tried
  function load() {
    try { return Object.assign({ drills: {}, lessons: {}, log: {}, notes: {} }, JSON.parse(localStorage.getItem(STORE) || "{}")); }
    catch (e) { return { drills: {}, lessons: {}, log: {}, notes: {} }; }
  }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
  let S = load();
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };  // local date, not UTC
  const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  const SC = window.SCENARIOS || [];
  const FW = window.THINK_FRAMEWORK || { intro: [], questions: [] };
  const lessonDrill = (l, i, d) => Object.assign({ kind: "sql", where: `Lesson ${i + 1}: <a href="#/lesson/${l.id}">${esc(l.title)}</a>` }, d);
  const thinkDrill = (sc, i, d) => Object.assign({ kind: "think", where: `Think ${i + 1}: <a href="#/think/${sc.id}">${esc(sc.title)}</a>` }, d);
  const ALL_DRILLS = L.flatMap((l, i) => l.drills.map(d => lessonDrill(l, i, d)))
    .concat(SC.flatMap((sc, i) => sc.drills.map(d => thinkDrill(sc, i, d))));

  function grade(id, ok) {
    const cur = S.drills[id] || { box: 0 };
    const box = ok ? Math.min(cur.box + 1, INTERVALS.length - 1) : 0;
    S.drills[id] = { box, due: addDays(today(), ok ? INTERVALS[box] : 1), last: today() };
    S.log[today()] = (S.log[today()] || 0) + 1;
    save(S);
  }
  function streak() {
    let n = 0, d = today();
    if (!S.log[d]) d = addDays(d, -1);
    while (S.log[d]) { n++; d = addDays(d, -1); }
    return n;
  }
  /* The daily set: done today + 1 Think drill + reviews that are due + new drills.
     Reviews never take every place, so new drills always come in.
     "Skip" and "New set" move a new drill to the back of the queue, or a due review to tomorrow. */
  function todayState() {
    const t = today();
    if (!S.day || S.day.date !== t) S.day = { date: t, extra: 0 };
    return S.day;
  }
  function todaysSet() {
    const t = today(), day = todayState(), later = S.later || {};
    const size = SET_SIZE + (day.extra || 0);
    const isThink = d => d.kind === "think";
    const doneToday = ALL_DRILLS.filter(d => S.drills[d.id] && S.drills[d.id].last === t);
    const due = ALL_DRILLS.filter(d => S.drills[d.id] && S.drills[d.id].due <= t && S.drills[d.id].last !== t)
                          .sort((x, y) => S.drills[x.id].due.localeCompare(S.drills[y.id].due));
    const fresh = ALL_DRILLS.map((d, i) => [d, i]).filter(([d]) => !S.drills[d.id])
                            .sort((x, y) => (later[x[0].id] || 0) - (later[y[0].id] || 0) || x[1] - y[1]).map(x => x[0]);
    const room = Math.max(0, size - doneToday.length);
    const pending = [], take = d => { if (d && pending.length < room && !pending.includes(d)) pending.push(d); };
    // 1. One Think drill each day: thinking is the most important skill.
    if (!doneToday.some(isThink)) take(due.find(isThink) || fresh.find(isThink));
    // 2. Reviews, oldest first, but leave places for new drills.
    const freshSql = fresh.filter(d => !isThink(d));
    const reviewRoom = freshSql.length ? Math.max(0, room - pending.length - NEW_SLOTS) : room;
    due.filter(d => !isThink(d)).slice(0, reviewRoom).forEach(take);
    // 3. New drills in course order (skipped ones go to the back). Then more reviews if nothing new is left.
    freshSql.forEach(take);
    due.forEach(take);
    return { done: doneToday, pending, size };
  }
  function skipDrill(id) {
    const st = S.drills[id];
    if (st) st.due = addDays(today(), 1);                 // a due review moves to tomorrow; its box does not change
    else { S.later = S.later || {}; S.later[id] = Date.now(); }   // a new drill goes to the back of the queue
  }

  /* ================= tiny SQL highlighter ================= */
  const KW = "SELECT|FROM|WHERE|GROUP|BY|ORDER|HAVING|JOIN|LEFT|INNER|CROSS|APPLY|ON|AS|AND|OR|NOT|IN|IS|NULL|CASE|WHEN|THEN|ELSE|END|WITH|INSERT|INTO|UPDATE|SET|DELETE|CREATE|OR|ALTER|DROP|TABLE|VIEW|PROCEDURE|FUNCTION|INDEX|INCLUDE|EXEC|DECLARE|BEGIN|TRY|CATCH|TRANSACTION|COMMIT|ROLLBACK|THROW|RETURN|RETURNS|VALUES|DISTINCT|TOP|OVER|PARTITION|ROWS|UNBOUNDED|PRECEDING|EXISTS|BETWEEN|LIKE|UNION|ALL|EXCEPT|GROUPING|SETS|DESC|ASC|IF|TRUNCATE|WITHIN|COLLATE|STATISTICS|IO|TIME|OFF";
  const FN = "COUNT|SUM|AVG|MIN|MAX|CAST|CONVERT|TRY_CONVERT|NULLIF|COALESCE|ISNULL|TRIM|LEFT|RIGHT|SUBSTRING|REPLACE|CHARINDEX|LEN|UPPER|LOWER|DATEDIFF|DATEDIFF_BIG|DATEADD|DATEFROMPARTS|YEAR|MONTH|DAY|ROW_NUMBER|LAG|LEAD|PERCENTILE_CONT|HASHBYTES|STRING_SPLIT|STRING_AGG|STRING_ESCAPE|OPENJSON|CONCAT|CONCAT_WS|IIF|SYSDATETIME|SYSUTCDATETIME|OBJECT_ID|STUFF|CRYPT_GEN_RANDOM|DATENAME|DATEPART";
  const reTok = new RegExp("(--[^\\n]*)|('(?:[^']|'')*')|\\b(" + FN + ")(?=\\s*\\()|\\b(" + KW + ")\\b", "gi");
  function hl(sql) {
    let out = "", last = 0;
    sql.replace(reTok, (m, com, str, fn, kw, idx) => {
      out += esc(sql.slice(last, idx));
      out += com ? `<span class="com">${esc(com)}</span>` : str ? `<span class="str">${esc(str)}</span>`
           : fn ? `<span class="fn">${esc(fn)}</span>` : `<span class="kw">${esc(kw)}</span>`;
      last = idx + m.length; return m;
    });
    return out + esc(sql.slice(last));
  }
  const codeBlock = sql => `<div class="code"><button class="btn copy" data-copy>Copy</button><pre><code>${hl(sql)}</code></pre></div>`;

  /* ================= diagrams (3Blue1Brown: picture first) ================= */
  const T = (x, y, s, cls = "") => `<text x="${x}" y="${y}" class="d-txt ${cls}" text-anchor="middle" dominant-baseline="middle">${esc(s)}</text>`;
  const ARROW = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="d-fill-accent"/></marker></defs>`;
  function wrap(s, max) {
    const words = String(s).split(" "), lines = [""];
    words.forEach(w => { if ((lines[lines.length - 1] + " " + w).trim().length > max) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + " " + w).trim(); });
    return lines;
  }
  const D = {
    flow(d) {
      const n = d.nodes.length, W = 760, bw = Math.min(150, (W - (n - 1) * 26) / n), H = 110;
      let s = "";
      d.nodes.forEach((t, i) => {
        const x = i * (bw + 26), lines = wrap(t, Math.floor(bw / 8));
        s += `<rect x="${x}" y="25" width="${bw}" height="60" rx="10" class="d-box ${i === 0 || i === n - 1 ? "hi" : ""}"/>`;
        lines.forEach((ln, k) => { s += T(x + bw / 2, 55 + (k - (lines.length - 1) / 2) * 16, ln, i === 0 ? "b" : ""); });
        if (i < n - 1) s += `<line x1="${x + bw + 2}" y1="55" x2="${x + bw + 22}" y2="55" class="d-line accent" marker-end="url(#ah)"/>`;
      });
      const total = n * bw + (n - 1) * 26;
      return `<svg viewBox="-4 0 ${total + 8} ${H}" role="img">${ARROW}${s}</svg>`;
    },
    layers(d) {
      let s = ""; const W = 760;
      d.layers.forEach((l, i) => {
        const y = 10 + i * 78, inset = i * 40;
        s += `<rect x="${inset}" y="${y}" width="${W - inset * 2}" height="62" rx="12" class="d-box ${l.tone}"/>`;
        s += `<text x="${inset + 18}" y="${y + 26}" class="d-txt b">${esc(l.name)}</text>`;
        s += `<text x="${inset + 18}" y="${y + 46}" class="d-txt">${esc(l.text)}</text>`;
        if (d.arrows !== false && i < d.layers.length - 1) s += `<line x1="${W / 2}" y1="${y + 63}" x2="${W / 2}" y2="${y + 86}" class="d-line accent" marker-end="url(#ah)"/>`;
      });
      return `<svg viewBox="0 0 ${W} ${d.layers.length * 78 + 10}" role="img">${ARROW}${s}</svg>`;
    },
    timeline(d) {
      const W = 760, x0 = 40, x1 = W - 40, sc = t => x0 + (x1 - x0) * (d.scale === "sqrt" ? Math.sqrt(t / d.max) : t / d.max);
      let s = `<line x1="${x0}" y1="70" x2="${x1}" y2="70" class="d-line"/>`;
      d.marks.forEach((m, i) => {
        const x = sc(m.t), up = i % 2 === 0, warn = /4h|12h|ends/i.test(m.label);
        s += `<line x1="${x}" y1="${warn ? 20 : 62}" x2="${x}" y2="${warn ? 120 : 78}" class="d-line ${warn ? "bad" : "accent"}"/>`;
        s += `<circle cx="${x}" cy="70" r="5" class="d-fill-accent"/>`;
        s += T(Math.min(Math.max(x, 50), W - 50), warn ? 10 : (up ? 42 : 100), m.label, warn ? "b" : "");
      });
      s += T(W / 2, 138, (d.unit ? `time (${d.unit})` : "time since arrival (hours)") + (d.scale === "sqrt" ? " · stretched near arrival, not to scale" : ""), "mute");
      return `<svg viewBox="0 -6 ${W} 156" role="img">${s}</svg>`;
    },
    grid(d) {
      const rh = 28;
      const widths = t => t.cols.map((c, i) => Math.max(60, 16 + 7.4 * Math.max(String(c).length, ...t.rows.map(r => String(r[i]).length))));
      const tbl = (t, ox, tone) => {
        let s = "", x = ox; const ws = widths(t);
        t.cols.forEach((c, i) => {
          s += `<rect x="${x}" y="10" width="${ws[i]}" height="${rh}" class="d-box ${tone}"/>` + T(x + ws[i] / 2, 10 + rh / 2, c, "b");
          t.rows.forEach((r, j) => { s += `<rect x="${x}" y="${10 + (j + 1) * rh}" width="${ws[i]}" height="${rh}" class="d-box"/>` + T(x + ws[i] / 2, 10 + (j + 1.5) * rh, r[i], "m"); });
          x += ws[i];
        });
        return { s, w: x - ox };
      };
      const gap = Math.max(200, Math.max(...wrap(d.arrow, 26).map(x => x.length)) * 7.6 + 44), wa = widths(d.before).reduce((a, b) => a + b, 0), wb = widths(d.after).reduce((a, b) => a + b, 0);
      const total = wa + gap + wb, W = Math.max(760, total), off = (W - total) / 2;
      const a = tbl(d.before, off, "bronze"), b = tbl(d.after, off + wa + gap, "silver");
      const h = Math.max(d.before.rows.length, d.after.rows.length) * rh + rh + 20;
      const ax = off + wa + 10, bx = off + wa + gap - 10, my = 10 + rh * 1.5 + 18;
      const lines = wrap(d.arrow, 26);
      const lab = lines.map((ln, k) => T((ax + bx) / 2, my - 12 - (lines.length - 1 - k) * 14, ln, "m")).join("");
      return `<svg viewBox="0 0 ${W} ${Math.max(h + 10, 90)}" role="img">${ARROW}${a.s}${b.s}<line x1="${ax}" y1="${my}" x2="${bx}" y2="${my}" class="d-line accent" marker-end="url(#ah)"/>${lab}</svg>`;
    },
    venn(d) {
      return `<svg viewBox="0 0 520 220" role="img">
        <defs><clipPath id="vr"><circle cx="300" cy="110" r="90"/></clipPath></defs>
        <circle cx="210" cy="110" r="90" class="d-venn-hi"/>
        <circle cx="300" cy="110" r="90" fill="var(--card)"/>
        <circle cx="210" cy="110" r="90" class="d-venn" clip-path="url(#vr)"/>
        <circle cx="210" cy="110" r="90" class="d-venn" fill="none"/><circle cx="300" cy="110" r="90" class="d-venn" fill="none"/>
        ${T(160, 110, "no match", "b")}${T(255, 110, "match")}${T(345, 110, "unused", "mute")}
        ${T(150, 210, d.left, "m")}${T(370, 210, d.right, "m")}</svg>`;
    },
    star(d) {
      const cx = 380, cy = 150, R = 120; let s = "";
      d.points.forEach((p, i) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / d.points.length, x = cx + Math.cos(a) * R * 2.1, y = cy + Math.sin(a) * R;
        s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="d-line"/>`;
        s += `<rect x="${x - 85}" y="${y - 16}" width="170" height="32" rx="8" class="d-box silver"/>` + T(x, y, p, "m");
      });
      s += `<rect x="${cx - 90}" y="${cy - 24}" width="180" height="48" rx="10" class="d-box gold"/>` + T(cx, cy, d.center, "b");
      return `<svg viewBox="0 0 760 300" role="img">${s}</svg>`;
    },
    tree(d) {
      const hiT = d.highlight || [];
      let s = ""; const W = 760, pos = [];
      d.levels.forEach((lv, j) => {
        pos[j] = lv.map((_, i) => ({ x: (i + 0.5) * W / lv.length, y: 30 + j * 70 }));
        lv.forEach((t, i) => {
          const p = pos[j][i];
          if (j > 0) { const parent = pos[j - 1][Math.floor(i * d.levels[j - 1].length / lv.length)]; s += `<line x1="${parent.x}" y1="${parent.y + 15}" x2="${p.x}" y2="${p.y - 15}" class="d-line ${j === 2 && hiT.includes(i) ? "accent" : ""}"/>`; }
        });
      });
      d.levels.forEach((lv, j) => lv.forEach((t, i) => { const p = pos[j][i], w = Math.min(230, W / lv.length - 12);
        s += `<rect x="${p.x - w / 2}" y="${p.y - 15}" width="${w}" height="30" rx="7" class="d-box ${j === 2 && hiT.includes(i) ? "hi" : ""}"/>` + T(p.x, p.y, t, "m"); }));
      return `<svg viewBox="0 0 ${W} ${d.levels.length * 70 + 10}" role="img">${s}</svg>`;
    },
    loop(d) {
      const cx = 380, cy = 130, rx = 260, ry = 95; let s = "";
      const pts = d.nodes.map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / d.nodes.length; return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }; });
      s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" class="d-line accent" stroke-dasharray="2 6"/>`;
      pts.forEach((p, i) => { s += `<rect x="${p.x - 80}" y="${p.y - 18}" width="160" height="36" rx="18" class="d-box ${i === (d.highlight ?? 2) ? "gold" : "hi"}"/>` + T(p.x, p.y, d.nodes[i], i === (d.highlight ?? 2) ? "b" : ""); });
      return `<svg viewBox="0 0 760 260" role="img">${s}</svg>`;
    }
  };
  const diagram = d => `<figure class="diagram" style="margin:0">${(D[d.type] || (() => ""))(d)}<figcaption>${esc(d.caption || "")}</figcaption></figure>`;

  /* ================= setup scripts and prerequisites ================= */
  const SCRIPTS = {
    "00": { file: "00_check_access.sql", what: "Read only. Checks dbo.ED_sandpit, your SQL Server version and settings, and what your login can create. It changes nothing.",
            check: "SELECT COUNT(*) AS rows_in_ed_sandpit FROM dbo.ED_sandpit;", expect: "20000" },
    "01": { file: "01_reference.sql", what: "Creates the lookup tables as temp tables: #ref_ethnic_category, #ref_attendance_disposal, #ref_discharge_destination, #ref_triage_category, #ref_department_type.",
            check: "SELECT COUNT(*) AS ethnic_codes FROM #ref_ethnic_category;", expect: "18" },
    "02": { file: "02_silver.sql", what: "Checks every NHS number into #etl_nhs_check, then loads #silver_attendance and #silver_attendance_diagnosis. It logs each run in #etl_load_log.",
            check: "SELECT COUNT(*) AS silver_rows FROM #silver_attendance;", expect: "19945" },
    "03": { file: "03_gold.sql", what: "Builds and loads the star schema: #gold_dim_date, #gold_dim_patient (SCD2), #gold_fact_attendance. Then it shows the monthly 4-hour table.",
            check: "SELECT COUNT(*) AS fact_rows FROM #gold_fact_attendance;", expect: "19945" },
    "04": { file: "04_dq_tests.sql", what: "Runs the data-quality tests and stores the results in #dq_test_result.",
            check: "SELECT COUNT(*) AS failed_tests FROM #dq_test_result WHERE passed = 0 AND run_id = (SELECT TOP (1) run_id FROM #dq_test_result ORDER BY run_dttm DESC);", expect: "1" }
  };
  const SQL_BASE = "https://github.com/mralph2705/Road_to_SQL/blob/main/sql/";
  function needsBox(needs) {
    if (!needs) return "";
    if (!needs.length) return `<div class="needs ok"><b>Before you run this:</b> nothing. These queries read dbo.ED_sandpit and the system catalogue only.</div>`;
    return `<div class="needs"><b>Before you run this:</b> run these scripts in <b>this same query window</b>, in this order. Or run <a href="${SQL_BASE}run_all_in_this_window.sql" target="_blank" rel="noopener">sql/run_all_in_this_window.sql</a> once.
      <span class="needs-list">${needs.map(n => `<a class="pill" href="${SQL_BASE}${SCRIPTS[n].file}" target="_blank" rel="noopener">sql/${SCRIPTS[n].file}</a>`).join(" → ")}</span>
      <span class="small muted">The scripts make temp tables (#name). They need no permissions, and they last until you close the window. New window? Run them again. See <a href="#/setup">Setup</a>.</span></div>`;
  }

  /* ================= drills ================= */
  /* answer checking: run the query on your SQL Server, type the result here */
  const norm = v => String(v).trim().toLowerCase().replace(/[%,\s]+/g, " ").replace(/^'+|'+$/g, "").trim();
  function checkAnswer(d, raw) {
    if (raw == null || String(raw).trim() === "") return null;
    if (typeof d.ans === "number") {
      const n = parseFloat(String(raw).replace(/[,%\s]|min/gi, ""));
      if (isNaN(n)) return false;
      return Math.abs(n - d.ans) <= (d.tol != null ? d.tol : 0);
    }
    const got = norm(raw);
    return [d.ans].concat(d.accept || []).some(x => norm(x) === got);
  }
  function answerBox(d) {
    if (d.ans === undefined) return "";
    const rec = (S.answers || {})[d.id];
    const prev = rec && rec.date === today() ? rec.v : "";
    const ok = prev ? checkAnswer(d, prev) : null;
    return `<div class="answer">
      <label class="small muted" for="ans_${d.id}">Run your query in SSMS. Type the result${d.unit ? ` (${esc(d.unit)})` : ""}:</label>
      <div class="answer-row">
        <input id="ans_${d.id}" class="answer-input" data-answer="${d.id}" value="${esc(prev || "")}" autocomplete="off" placeholder="${typeof d.ans === "number" ? "a number" : esc(d.fmt || "your answer")}">
        <button class="btn primary" data-check="${d.id}">Check</button>
      </div>
      <div class="answer-result ${ok === true ? "ok" : ok === false ? "no" : ""}" aria-live="polite">${ok === true ? "✓ Correct." : ok === false ? "✗ Not yet." + (d.hint ? " Hint: " + esc(d.hint) : " Check your filters and try again.") : ""}</div>
    </div>`;
  }
  /* ================= help ladder (hint -> explain in STE -> answer) ================= */
  const HELP = window.DRILL_HELP || {};
  const THINK_HELP = window.THINK_HELP || { hint: "", steps: [] };
  const fmtAns = d => typeof d.ans === "number" ? d.ans.toLocaleString("en-GB") + (d.unit ? " " + d.unit : "") : String(d.ans);
  function aiPrompt(d, myQuery, myResult) {
    return [
      "You are my SQL tutor. Explain in ASD-STE100 Simplified Technical English, about 80% of the way:",
      "short sentences, one instruction per step, active voice, one name for each thing.",
      "Do not give me the full query. Show me the first thing that is wrong and the next step to try.",
      "",
      "Context: SQL Server 2017. Source table dbo.ED_sandpit: one row per ED attendance record, 20,000 rows, 264 columns",
      "(for example AE_ID, AE_Episode_Number, NHSNo, Sex, DoB, Arrived_DTTM, Seen_DTTM, Departed_DTTM, Eth_Group_Code).",
      "Clean layer: temp table #silver_attendance (one row per episode; arrival_dttm, departure_dttm, dept_type, nhs_status, ethnic_code).",
      "I cannot create schemas, permanent tables, views, functions or procedures. Use temp tables (#name) only.",
      "",
      "Question: " + d.q,
      "",
      "My query:",
      myQuery && myQuery.trim() ? myQuery.trim() : "(paste your query here)",
      "",
      "My result or error message:",
      myResult && myResult.trim() ? myResult.trim() : "(paste your result or the full error message here)",
      "",
      "Tell me: 1) what my query does now, 2) the first thing that is wrong, 3) the next step to try."
    ].join("\n");
  }
  function helpPanel(d) {
    const h = HELP[d.id] || (d.kind === "think" ? THINK_HELP : null);
    if (!h) return "";
    const lvl = ((S.help || {})[d.id] && S.help[d.id].date === today()) ? S.help[d.id].level : 0;
    const q = (S.notes || {})["hq_" + d.id] || "", r = (S.notes || {})["hr_" + d.id] || "";
    const answerPart = d.ans !== undefined
      ? `<p><b>Answer:</b> <span class="mono">${esc(fmtAns(d))}</span></p>${d.sql ? `<p class="small muted">The answer query (it returns this value):</p>${codeBlock(d.sql)}` : ""}`
      : (d.a ? `<p><b>Model answer:</b></p><div class="model">${esc(d.a)}</div>` : "");
    return `<details class="help" ${lvl > 0 ? "open" : ""} data-help="${d.id}">
      <summary>I'm stuck - help me</summary>
      <div class="help-body">
        <div class="help-steps">
          <button class="btn ${lvl >= 1 ? "on" : ""}" data-help-level="1">1 · Hint</button>
          <button class="btn ${lvl >= 2 ? "on" : ""}" data-help-level="2">2 · Explain the method</button>
          <button class="btn ${lvl >= 3 ? "on" : ""}" data-help-level="3">3 · Show the answer</button>
        </div>
        ${lvl >= 1 ? `<div class="help-block"><div class="eyebrow">Hint</div><p>${esc(h.hint)}</p></div>` : ""}
        ${lvl >= 2 ? `<div class="help-block"><div class="eyebrow">Method (ASD-STE100)</div><ol class="steps">${h.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
        ${lvl >= 3 ? `<div class="help-block"><div class="eyebrow">Answer</div>${answerPart}
            <p class="small muted">Showing the answer sets this drill to come back tomorrow. That is not a penalty: it is how you learn it.</p></div>` : ""}
        <div class="help-block ai">
          <div class="eyebrow">Ask an AI tutor (Karpathy's method)</div>
          <p class="small">Paste your query and your result or error. Copy the prompt into Claude. It asks for a plain STE explanation, not the solution.</p>
          <textarea class="note" rows="4" data-note="hq_${d.id}" placeholder="Your query">${esc(q)}</textarea>
          <textarea class="note" rows="2" data-note="hr_${d.id}" placeholder="Your result, or the full error message (for example Msg 8120 ...)">${esc(r)}</textarea>
          <div class="btn-row"><button class="btn" data-copy-prompt="${d.id}">Copy prompt for an AI</button>
            <a class="btn" href="#/help">SQL error guide</a></div>
        </div>
      </div>
    </details>`;
  }

  function drillCard(d, showLesson, canSkip) {
    const st = S.drills[d.id];
    const status = st ? (st.last === today() ? "done today · next " + st.due : `review · box ${st.box}`) : "new";
    const checkable = d.ans !== undefined;
    const showLabel = d.a ? "Show the model answer" : "Show the answer query";
    return `<div class="drill" data-drill="${d.id}">
      <p class="q">${esc(d.q)}</p>
      <div class="meta">${d.kind === "think" ? `<span class="pill gold">Think</span> ` : ""}${showLesson ? d.where + " · " : ""}${status}${canSkip ? ` <button class="btn small-btn" data-skip="${d.id}" title="Swap this drill for another one">Skip</button>` : ""}</div>
      ${checkable ? answerBox(d) : noteBox("d_" + d.id, "Write your answer first. 3–5 short sentences.")}
      ${helpPanel(d)}
      ${(d.sql || d.a) ? `<div class="btn-row"><button class="btn" data-show data-label="${showLabel}">${showLabel}</button></div>` : ""}
      <div class="reveal">${d.a ? `<div class="model">${esc(d.a)}</div>` : ""}${d.sql ? codeBlock(d.sql) : ""}
        ${checkable ? `<p class="small muted">This query returns one value: the answer to type in the box. Compare it with your own query.</p>`
          : `<div class="btn-row"><span class="muted small" style="align-self:center">Did you cover the main points?</span>
          <button class="btn good" data-grade="1">Got it</button><button class="btn bad" data-grade="0">Again tomorrow</button></div>`}
      </div></div>`;
  }

  /* ================= pages ================= */
  const stageTone = s => /gold/i.test(s) ? "gold" : /silver/i.test(s) ? "silver" : /bronze/i.test(s) ? "bronze" : "";

  function pageToday() {
    const { done, pending, size } = todaysSet(), doneL = L.filter(l => S.lessons[l.id]).length, doneT = SC.filter(sc => S.lessons["think:" + sc.id]).length, mastered = Object.values(S.drills).filter(x => x.box >= 3).length;
    const next = L.find(l => !S.lessons[l.id]) || L[0];
    return `<div class="hero">
      <div>
        <div class="eyebrow">ED SQL · ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>Today's 30-minute loop</h1>
        <p class="lede">Practise T-SQL on dbo.ED_sandpit: 20,000 ED attendances with real data-quality problems. Write each query in SSMS, then type your result here to check it.</p>
        <p class="small">New here? Read <a href="#/setup">Setup</a> first. No special permissions needed: one script builds everything as temp tables in your query window.</p>
        <div class="stats">
          <div class="stat"><b>${streak()}</b><span>day streak</span></div>
          <div class="stat"><b>${doneL}/${L.length} · ${doneT}/${SC.length}</b><span>lessons · think</span></div>
          <div class="stat"><b>${mastered}/${ALL_DRILLS.length}</b><span>drills mastered</span></div>
        </div>
      </div>
      <div class="card"><h3>The loop</h3><ol class="loop">
        <li>Recall <small>· 5 min. Do the due drills without notes.</small></li>
        <li>Picture <small>· 5 min. Read the diagram of <a href="#/lesson/${next.id}">${esc(next.title)}</a>.</small></li>
        <li>Think <small>· every day's set has one Think drill. Twice a week, do a full <a href="#/think">scenario</a> instead of a lesson.</small></li>
        <li>Write <small>· 10 min. Write the query in SSMS before you look.</small></li>
        <li>Verify <small>· 3 min. Type your result in the answer box. The site checks it against ED_sandpit.</small></li>
        <li>Explain <small>· 2 min. Write 3 short STE sentences in your log.</small></li>
      </ol></div>
    </div>
    <div class="drills-head">
      <h2>Today's drills <span class="muted small">${done.length} of ${Math.min(size, done.length + pending.length)} done</span></h2>
      <div class="btn-row">
        ${pending.length ? `<button class="btn" data-new-set title="Swap every drill you have not done for other drills">↻ New set</button>` : ""}
        <button class="btn" data-more title="Add 5 more drills to today's set">+ 5 more</button>
      </div>
    </div>
    <p class="muted small">A correct answer comes back after 3, 7, 14, 30, then 60 days. A wrong answer, or "Show the answer", comes back tomorrow. Each set has one Think drill, the reviews that are due, and at least two new drills. <b>Skip</b> or <b>New set</b> swaps drills: a new drill goes to the back of the queue, and a review moves to tomorrow. Progress stays in this browser. Use the backup buttons at the bottom of this page to move it.</p>
    ${pending.map(d => drillCard(d, true, true)).join("")}
    ${!pending.length ? `<div class="card">All of today's drills are done. Press <b>+ 5 more</b> for another set, or read the next lesson.</div>` : ""}
    ${done.length ? `<details class="done-today"><summary>Done today (${done.length})</summary>${done.map(d => drillCard(d, true)).join("")}</details>` : ""}
    <h2>Backup</h2>
    <div class="btn-row"><button class="btn" data-export>Export progress</button><label class="btn">Import progress<input type="file" accept="application/json" data-import hidden></label><button class="btn bad" data-reset>Reset</button></div>`;
  }

  function pagePath() {
    const stages = [...new Set(L.map(l => l.stage))];
    return `<div class="eyebrow">Learning path</div><h1>16 lessons, bronze to gold</h1>
      <p class="lede">The order follows a real pipeline: profile the raw extract, clean it, model it, protect it, test it. Each lesson uses the same table.</p>
      <div class="grid g3">${L.map((l, i) => `<a class="card lesson-card" href="#/lesson/${l.id}">
        <span class="num">${String(i + 1).padStart(2, "0")} <span class="pill ${stageTone(l.stage)}">${esc(l.stage)}</span></span>
        <h3>${esc(l.title)}</h3><p>${esc(l.nhs.split(". ")[0])}.</p>
        ${S.lessons[l.id] ? `<span class="done">✓ Done</span>` : ""}</a>`).join("")}</div>`;
  }

  function pageLesson(id) {
    const i = L.findIndex(l => l.id === id), l = L[i];
    if (!l) return pagePath();
    const prev = L[i - 1], next = L[i + 1];
    return `<div class="narrow" style="max-width:860px">
      <div class="lesson-head"><span class="eyebrow">Lesson ${i + 1} of ${L.length}</span><span class="pill ${stageTone(l.stage)}">${esc(l.stage)}</span></div>
      <h1>${esc(l.title)}</h1>

      <div class="section"><div class="eyebrow">1 · Picture first</div>${diagram(l.diagram)}</div>

      <div class="section"><div class="eyebrow">2 · Pause and ponder</div>
        <div class="card ponder"><p class="q">${esc(l.ponder.q)}</p>
        <div class="btn-row"><button class="btn" data-reveal>Show the answer</button></div>
        <div class="reveal">${esc(l.ponder.a)}</div></div></div>

      <div class="section"><div class="eyebrow">3 · Explain (ASD-STE100)</div>
        <ul class="ste">${l.ste.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>

      <div class="section"><div class="eyebrow">4 · Procedure</div>
        <ol class="steps">${l.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>

      <div class="section"><div class="eyebrow">Why NHS teams ask for this</div><div class="nhs-box">${esc(l.nhs)}</div></div>

      <div class="section"><div class="eyebrow">5 · The query</div>${needsBox(l.needs)}${codeBlock(l.sql)}
        <ul class="pitfalls small">${l.pitfalls.map(p => `<li><b>Pitfall:</b> ${esc(p)}</li>`).join("")}</ul></div>

      <div class="section"><div class="eyebrow">6 · Watch</div>
        <a class="card video" href="${esc(l.video.url)}" target="_blank" rel="noopener"><span class="play"></span>
        <span><b>${esc(l.video.title)}</b><small>${esc(l.video.who)} · opens YouTube / the source in a new tab</small></span></a></div>

      <div class="section"><div class="eyebrow">7 · Drills</div>${l.drills.map(d => drillCard(lessonDrill(l, i, d), false)).join("")}</div>

      <div class="btn-row" style="justify-content:space-between;margin-top:24px">
        ${prev ? `<a class="btn" href="#/lesson/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
        <button class="btn primary" data-done="${l.id}">${S.lessons[l.id] ? "✓ Done" : "Mark lesson done"}</button>
        ${next ? `<a class="btn" href="#/lesson/${next.id}">${esc(next.title)} →</a>` : "<span></span>"}
      </div></div>`;
  }

  function pageHelp() {
    const E = window.SQL_ERRORS || [];
    const example = aiPrompt({ q: "How many rows have a Sex value that is not exactly 'M' or 'F'? Use a case-sensitive comparison." },
      "SELECT COUNT(*) FROM dbo.ED_sandpit WHERE Sex NOT IN ('M','F');", "142 (the site says not yet)");
    return `<div class="narrow" style="max-width:860px"><div class="eyebrow">Help</div><h1>When you are stuck</h1>
      <p class="lede">Being stuck is part of the work. Use help in small steps, so you still do most of the thinking.</p>
      <h2>The help ladder</h2>
      <div class="card"><ol class="steps">
        <li><b>Hint.</b> One nudge. Try again after it.</li>
        <li><b>Explain the method.</b> The steps in ASD-STE100: one action per step. Write the query from the steps.</li>
        <li><b>Show the answer.</b> The number and the best query. The drill comes back tomorrow, so you practise it again.</li>
        <li><b>Ask an AI tutor.</b> Paste your query and your error. Copy the prompt into Claude. The prompt asks for an STE explanation and the next step, not the full answer.</li>
      </ol>
      <p class="small muted">Every drill has an "I'm stuck - help me" panel under its answer box.</p></div>
      <h2>Why the prompt uses ASD-STE100</h2>
      <ul class="ste">
        <li>Karpathy suggests that you ask a model to explain in ASD-STE100, about 80% of the way.</li>
        <li>STE gives short steps that you can read one time and do correctly.</li>
        <li>It also makes the model use one name for one thing, so "table", "view" and "dataset" do not mix.</li>
        <li>Always check the AI's query with the answer box. The answer box is your verifier.</li>
      </ul>
      <h2>Example prompt</h2>
      <div class="code"><button class="btn copy" data-copy>Copy</button><pre><code>${esc(example)}</code></pre></div>
      <h2>SQL Server error guide</h2>
      <p class="muted small">Read the message number first. Then find it here.</p>
      ${E.map(e => `<details class="card err"><summary><span class="mono small">${esc(e.msg)}</span></summary>
        <p><b>Cause:</b> ${esc(e.cause)}</p><ol class="steps">${e.fix.map(f => `<li>${esc(f)}</li>`).join("")}</ol></details>`).join("")}
      <h2>Before you ask for help</h2>
      <ol class="steps">
        <li>Read the question again. Underline each filter.</li>
        <li>Check the table: dbo.ED_sandpit (raw, 20,000 rows) or #silver_attendance (clean, 19,945 rows).</li>
        <li>Run each part of the query alone. Look at the rows, not only the count.</li>
        <li>Write down what you expected and what you got.</li>
      </ol></div>`;
  }

  function pageSetup() {
    const PROD = [
      ["Schemas silver, gold, ref, etl, dq", "CREATE SCHEMA", "A name prefix: #silver_attendance, #ref_ethnic_category"],
      ["Function etl.fn_nhs_number_check", "CREATE FUNCTION", "The rule calculated once into #etl_nhs_check (lesson 4 shows it as a plain query)"],
      ["Procedures etl.usp_load_silver_attendance, etl.usp_load_gold, dq.usp_run_tests", "CREATE PROCEDURE", "The procedure bodies as plain batches in sql/02, 03 and 04"],
      ["View gold.vw_ed_performance_monthly", "CREATE VIEW", "The view's query, at the end of sql/03_gold.sql"],
      ["Permanent tables and indexes", "CREATE TABLE, ALTER", "Temp tables and indexes on temp tables"],
      ["Extended property MS_Description (Think 9)", "ALTER on the table", "A description header in each script, and a data dictionary query"],
      ["OPENROWSET(BULK) to read a file (Think 5)", "ADMINISTER BULK OPERATIONS", "Paste the file's header line into a variable"],
      ["Compatibility level 140", "ALTER on the database", "Not needed: no query uses STRING_SPLIT or OPENJSON"]
    ];
    return `<div class="narrow" style="max-width:860px"><div class="eyebrow">Setup</div><h1>Build your practice tables</h1>
      <p class="lede">You need read access to dbo.ED_sandpit and nothing else. The scripts build the whole course as <b>temporary tables</b> (#name). Every SQL Server login can create those. SQL Server 2017 or later.</p>
      <div class="card"><h3>Every practice session</h3><ol class="steps">
        <li>Open SSMS. Connect to your server.</li>
        <li>Open one new query window. Select the database that holds dbo.ED_sandpit in the toolbar list.</li>
        <li>Open <a href="${SQL_BASE}run_all_in_this_window.sql" target="_blank" rel="noopener">sql/run_all_in_this_window.sql</a> in that window (File → Open → File, or paste it). Press F5. It takes about 10 seconds.</li>
        <li>Do the lessons in the <b>same</b> window. Paste each query under the script, select it, and press F5 to run only the selection.</li>
        <li>When you close the window, the temp tables are deleted. Next time, start at step 2.</li>
      </ol>
      <p class="small muted">Lessons 1, 3 and 5 and Think 5 and 9 need no scripts: they read dbo.ED_sandpit only.</p></div>
      <h2>First time: check your access</h2>
      <p>Run <a href="${SQL_BASE}${SCRIPTS["00"].file}" target="_blank" rel="noopener">sql/00_check_access.sql</a>. It changes nothing. It shows the row count, your SQL Server version, the collation, and a 1 or 0 for each permission. The last result must say "Temp tables work".</p>
      <h2>The scripts, one by one</h2>
      <p class="small muted">run_all_in_this_window.sql is scripts 01 to 04 in one file. Use the separate files when a lesson asks you to run one step again (for example Think 3 runs 02 twice).</p>
      ${Object.keys(SCRIPTS).map(k => { const x = SCRIPTS[k]; return `<div class="card setup-step">
        <h3><span class="mono">${k}</span> · <a href="${SQL_BASE}${x.file}" target="_blank" rel="noopener">sql/${esc(x.file)}</a></h3>
        <p>${esc(x.what)}</p>
        <p class="small muted">Check (expect ${esc(x.expect)}):</p>${codeBlock(x.check)}</div>`; }).join("")}
      <h2>Check the answers on your server</h2>
      <p>Every drill with an answer box has an answer query that returns one value. <a href="${SQL_BASE}98_check_answers.sql" target="_blank" rel="noopener">sql/98_check_answers.sql</a> runs all of them and compares each result with the stored answer. Run it in a new window. The last result has one row per drill: expected, got, and PASS, FAIL or ERROR. It holds counts and percentages only, so it is safe to share.</p>
      <h2>Which lessons need which scripts</h2>
      <div class="card table-wrap"><table class="t"><thead><tr><th>Lesson</th><th>Scripts</th></tr></thead><tbody>
        ${L.map((l, i) => `<tr><td><a href="#/lesson/${l.id}">${i + 1}. ${esc(l.title)}</a></td><td class="mono">${(l.needs || []).join(", ") || "none"}</td></tr>`).join("")}
        ${SC.map((sc, i) => `<tr><td><a href="#/think/${sc.id}">Think ${i + 1}. ${esc(sc.title)}</a></td><td class="mono">${(sc.needs || []).join(", ") || "none"}</td></tr>`).join("")}
      </tbody></table></div>
      <h2>Temp tables: what to know</h2>
      <ul class="ste">
        <li>A temp table lives in one query window. Other windows and other users cannot see it.</li>
        <li>Msg 208 "Invalid object name '#silver_attendance'" means this window has no temp tables. Run the scripts again in this window.</li>
        <li>The load log, the test results and the SCD2 history last until you close the window.</li>
        <li>Each window makes a new salt, so pseudo IDs change between windows. Counts do not change.</li>
      </ul>
      <h2>The production version (read only)</h2>
      <p>A real warehouse uses permanent objects. The scripts in <a href="https://github.com/mralph2705/Road_to_SQL/tree/main/sql/reference_only" target="_blank" rel="noopener">sql/reference_only/</a> show how to build them. <b>Do not run them</b> unless your DBA gives you the permissions. Read them to learn the production pattern. The folder README has a message template to ask your DBA for a personal schema.</p>
      <div class="card table-wrap"><table class="t"><thead><tr><th>Production object</th><th>Permission</th><th>What this course uses</th></tr></thead><tbody>
        ${PROD.map(r => `<tr><td>${esc(r[0])}</td><td class="mono small">${esc(r[1])}</td><td class="small">${esc(r[2])}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  /* ================= think track ================= */
  function noteBox(key, placeholder) {
    const v = (S.notes && S.notes[key]) || "";
    return `<textarea class="note" data-note="${key}" rows="4" placeholder="${esc(placeholder)}">${esc(v)}</textarea>`;
  }
  function pageThinkIndex() {
    const done = SC.filter(sc => S.lessons["think:" + sc.id]).length;
    return `<div class="eyebrow">Think like a data engineer · ${done}/${SC.length} done</div>
      <h1>Decide what to build before you build it</h1>
      <p class="lede">SQL is the easy half of the job. The hard half is turning a vague request into a correct definition, and building something that fails safely and that someone else can support. These scenarios practise that half.</p>
      <div class="grid g2">
        <div class="card"><h3>Read this first</h3><ul class="ste">${FW.intro.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="card"><h3>How each scenario works</h3><ol class="steps">
          <li>Read the request. It is vague on purpose.</li>
          <li>Write your clarifying questions in the box. Then compare.</li>
          <li>Read the one-page spec.</li>
          <li>Run the SQL against dbo.ED_sandpit and check the result here.</li>
          <li>Answer the "what breaks?" drills.</li></ol></div>
      </div>
      <h2>The six questions</h2>
      <p class="muted small">Ask these about every request. Most scenarios fail on one of them.</p>
      <div class="grid g3">${FW.questions.map((q, i) => `<div class="card"><span class="num mono muted small">${i + 1}</span><h3>${esc(q.name)}</h3><p class="small">${esc(q.ask)}</p><p class="small muted">${esc(q.why)}</p></div>`).join("")}</div>
      <h2>Scenarios</h2>
      <div class="grid g3">${SC.map((sc, i) => `<a class="card lesson-card" href="#/think/${sc.id}">
        <span class="num">${String(i + 1).padStart(2, "0")} <span class="pill gold">${esc(sc.skill)}</span></span>
        <h3>${esc(sc.title)}</h3><p>“${esc(sc.request.length > 110 ? sc.request.slice(0, 107) + "…" : sc.request)}”</p>
        ${S.lessons["think:" + sc.id] ? `<span class="done">✓ Done</span>` : ""}</a>`).join("")}</div>`;
  }
  function pageThink(id) {
    const i = SC.findIndex(x => x.id === id), sc = SC[i];
    if (!sc) return pageThinkIndex();
    const prev = SC[i - 1], next = SC[i + 1];
    return `<div class="narrow" style="max-width:860px">
      <div class="lesson-head"><span class="eyebrow">Think ${i + 1} of ${SC.length}</span><span class="pill gold">${esc(sc.skill)}</span></div>
      <h1>${esc(sc.title)}</h1>
      <div class="section"><div class="eyebrow">The request</div>
        <div class="msg"><div class="msg-from">${esc(sc.from)} <span class="muted">· ${esc(sc.channel)}</span></div><p>${esc(sc.request)}</p></div></div>

      <div class="section"><div class="eyebrow">1 · Picture first</div>${diagram(sc.diagram)}</div>

      <div class="section"><div class="eyebrow">2 · Your turn</div>
        <div class="card ponder"><p class="q">${esc(sc.task)}</p>
        ${noteBox("s_" + sc.id, "Write before you look. Use the six questions: decision, definition, grain, source, failure, governance.")}
        <div class="btn-row"><button class="btn" data-reveal data-label="Compare with model questions">Compare with model questions</button></div>
        <div class="reveal"><table class="t qtable"><thead><tr><th>Ask</th><th>Why it matters</th></tr></thead><tbody>
          ${sc.questions.map(q => `<tr><td><b>${esc(q.q)}</b></td><td class="small">${esc(q.why)}</td></tr>`).join("")}</tbody></table></div></div></div>

      <div class="section"><div class="eyebrow">3 · The one-page spec</div>
        <div class="card"><ul class="ste">${sc.spec.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>

      <div class="section"><div class="eyebrow">4 · The SQL</div>${needsBox(sc.needs)}${codeBlock(sc.sql)}
        ${sc.sqlNote ? `<p class="small muted">${esc(sc.sqlNote)}</p>` : ""}</div>

      <div class="section"><div class="eyebrow">5 · What breaks?</div>${sc.drills.map(d => drillCard(thinkDrill(sc, i, d), false)).join("")}</div>

      <div class="btn-row" style="justify-content:space-between;margin-top:24px">
        ${prev ? `<a class="btn" href="#/think/${prev.id}">← ${esc(prev.title)}</a>` : `<a class="btn" href="#/think">← All scenarios</a>`}
        <button class="btn primary" data-done="think:${sc.id}">${S.lessons["think:" + sc.id] ? "✓ Done" : "Mark scenario done"}</button>
        ${next ? `<a class="btn" href="#/think/${next.id}">${esc(next.title)} →</a>` : "<span></span>"}
      </div></div>`;
  }

  /* ================= router ================= */
  const ROUTES = { "": pageToday, setup: pageSetup, path: pagePath, think: a => a ? pageThink(a) : pageThinkIndex(), lesson: pageLesson, help: pageHelp };
  let keepScroll = false;
  function render() {
    const [, page = "", arg] = (location.hash || "#/").split("/");
    const fn = ROUTES[page] || pageToday;
    $("#app").innerHTML = fn(arg);
    document.querySelectorAll("nav.main a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + (page === "lesson" ? "path" : page)));
    if (!keepScroll) window.scrollTo(0, 0);
    keepScroll = false;
    const l = (page === "lesson" && L.find(x => x.id === arg)) || (page === "think" && SC.find(x => x.id === arg));
    document.title = (l ? l.title + " · " : "") + "ED SQL";
  }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1600); }

  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-copy")) {
      const txt = b.parentElement.querySelector("pre").textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Query copied"), () => toast("Select the text and copy it"));
    } else if (b.hasAttribute("data-reveal") || b.hasAttribute("data-show")) {
      const r = b.closest(".card, .drill").querySelector(".reveal"); r.classList.toggle("show");
      b.textContent = r.classList.contains("show") ? "Hide" : (b.dataset.label || (b.hasAttribute("data-show") ? "Show the answer" : "Show the answer"));
    } else if (b.hasAttribute("data-help-level")) {
      const id = b.closest("[data-help]").dataset.help, lvl = +b.dataset.helpLevel;
      S.help = S.help || {};
      const cur = S.help[id] && S.help[id].date === today() ? S.help[id].level : 0;
      S.help[id] = { level: Math.max(cur, lvl), date: today() };
      if (lvl === 3) { const st = S.drills[id]; if (!st || st.last !== today()) grade(id, false); }
      save(S); keepScroll = true; render();
    } else if (b.hasAttribute("data-copy-prompt")) {
      const id = b.dataset.copyPrompt, d = ALL_DRILLS.find(x => x.id === id);
      const txt = aiPrompt(d, (S.notes || {})["hq_" + id], (S.notes || {})["hr_" + id]);
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(() => toast("Prompt copied. Paste it into Claude."), () => { window.prompt("Copy this prompt:", txt); });
    } else if (b.hasAttribute("data-check")) {
      const id = b.dataset.check, d = ALL_DRILLS.find(x => x.id === id);
      const val = document.getElementById("ans_" + id).value;
      const ok = checkAnswer(d, val);
      if (ok === null) { toast("Type your result first"); return; }
      S.answers = S.answers || {}; S.answers[id] = { v: val, date: today() }; save(S);
      const st = S.drills[id];
      if (!st || st.last !== today()) grade(id, ok);      // first try today decides the schedule
      toast(ok ? "Correct" : "Not yet - try again"); keepScroll = true; render();
    } else if (b.hasAttribute("data-skip")) {
      skipDrill(b.dataset.skip); save(S); toast("Skipped. Here is another drill."); keepScroll = true; render();
    } else if (b.hasAttribute("data-new-set")) {
      todaysSet().pending.forEach(d => skipDrill(d.id)); save(S); toast("New set ready"); keepScroll = true; render();
    } else if (b.hasAttribute("data-more")) {
      todayState().extra += 5; save(S); toast("5 more drills added"); keepScroll = true; render();
    } else if (b.hasAttribute("data-grade")) {
      grade(b.closest("[data-drill]").dataset.drill, b.dataset.grade === "1");
      toast(b.dataset.grade === "1" ? "Nice. See you in a few days." : "Back tomorrow."); keepScroll = true; render();
    } else if (b.hasAttribute("data-done")) {
      S.lessons[b.dataset.done] = today(); S.log[today()] = (S.log[today()] || 0) + 1; save(S); toast("Lesson marked done"); keepScroll = true; render();
    } else if (b.hasAttribute("data-export")) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
      a.download = "ed-sql-progress.json"; a.click();
    } else if (b.hasAttribute("data-reset")) {
      if (confirm("Delete all progress in this browser?")) { S = { drills: {}, lessons: {}, log: {}, notes: {} }; save(S); render(); }
    } else if (b.id === "theme") {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
      try { localStorage.setItem("edgym.theme", document.documentElement.dataset.theme); } catch (err) { /* ignore */ }
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.matches("[data-answer]")) {
      const btn = document.querySelector(`[data-check="${e.target.dataset.answer}"]`); if (btn) btn.click();
    }
  });
  document.addEventListener("input", e => {
    if (!e.target.matches("[data-note]")) return;
    S.notes = S.notes || {}; S.notes[e.target.dataset.note] = e.target.value; save(S);
  });
  document.addEventListener("change", e => {
    if (!e.target.matches("[data-import]")) return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { S = Object.assign({ drills: {}, lessons: {}, log: {}, notes: {} }, JSON.parse(t)); save(S); toast("Progress imported"); render(); })
            .catch(() => toast("That file is not valid"));
  });
  try { const th = localStorage.getItem("edgym.theme"); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }
  window.addEventListener("hashchange", render);
  render();
})();
