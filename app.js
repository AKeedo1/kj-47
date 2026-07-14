/* =====================================================================
   CAIRN — app logic
   Data discipline (Sena/Nadia): store atomic events, DERIVE everything.
   Reused from kj-47: Date.now-anchored rest timer + visibility recompute.
   ===================================================================== */
(() => {
  "use strict";

  // ---------- constants ----------
  const KEY = "cairn.v1";
  const REST_SECONDS = 120;
  // Adaptive rest by movement (seconds) — compounds longer, isolation shorter; deconditioned/no-aerobic-base so err generous
  const REST_LOWER = ["leg_press", "goblet_squat", "db_rdl", "good_morning"];
  const REST_ISO = ["bicep_curl", "hammer_curl", "cable_curl", "tricep_pushdown", "overhead_tricep_extension", "lateral_raise", "calf_raise", "seated_calf_raise"];
  const REST_CORE = ["suitcase_carry", "pallof_press"];
  function restMult() { return store.restPref === "short" ? 0.75 : store.restPref === "long" ? 1.3 : 1; }
  function restFor(exId) { if (exId === "bike_finisher") return 0; const base = REST_LOWER.includes(exId) ? 150 : REST_ISO.includes(exId) ? 90 : REST_CORE.includes(exId) ? 90 : 120; return Math.round(base * restMult() / 5) * 5; }

  // Smart warm-up (Marcus's spec) — adapts to the day + any flagged joint. Floor drills swapped for standing (no-floor rule).
  const WARMUP = {
    aero: {
      monday: "8 min bike, easy — you can hold a full conversation.",
      wednesday: "5 min bike easy, then swing the arms into the drills.",
      saturday: "8 min bike easy — primes the hips with no ankle impact."
    },
    drills: {
      monday: ["Bodyweight box squats to a bench × 10", "Leg swings, front-to-back × 10 each side", "Ankle rocks (knee to wall) × 10 each side", "Band pull-aparts × 15"],
      wednesday: ["Band pull-aparts × 15", "Shoulder pass-throughs (band or dowel) × 10", "Wall slides × 10", "Bodyweight squats × 8"],
      saturday: ["Standing cat-cow (hands on thighs, round then arch) × 8", "Hip hinge rehearsal with a dowel × 10", "Standing wall hip-hinge with a glute squeeze × 10", "Leg swings, front-to-back × 10 each side", "Band pull-aparts × 15"]
    },
    flatfeet: "Flat feet: short-foot drill — lift the arch and grip the floor, 10s × 3. Keep the arch braced through squats, carries and calf raises.",
    joint: {
      Back: { drills: ["Standing cat-cow × 10 slow", "Standing thoracic rotations × 8 each side", "Standing anti-extension brace — hands on a wall, ribs down, slow knee march, don't let the low back arch × 8 each side"], cue: "Ease load 10-15% on rows and pulldowns today — don't chase weight." },
      Knee: { drills: ["Ankle rocks (knee to wall) × 10 each side", "Bodyweight box squats to a bench × 12", "Standing quad and hip-flexor stretch, 20s each side"], cue: "Keep squat and leg-press range pain-free — stop short of any pinch." },
      Ankle: { drills: ["Ankle circles × 10 each way, each foot", "Slow calf raises × 12"], cue: "Watch foot position on calf raises and carries — don't let the arch collapse." },
      Shoulder: { drills: ["Band pull-aparts × 20", "Shoulder pass-throughs × 12", "Wall slides × 12", "Band external rotations × 12 each side"], cue: "Drop to lighter dumbbells on presses today — clean reps over load." }
    }
  };
  function warmupFor(day, session) {
    const flagged = session.feel === "joints" && session.joint ? session.joint : null;
    const aero = (WARMUP.aero[day] || WARMUP.aero.monday) + (flagged ? ` Add 3 easy minutes for the ${flagged.toLowerCase()}.` : "");
    let drills = (WARMUP.drills[day] || []).slice(), cue = "";
    if (flagged && WARMUP.joint[flagged]) { drills = drills.concat(WARMUP.joint[flagged].drills); cue = WARMUP.joint[flagged].cue; }
    const list = drills.map(d => `<li>${d}</li>`).join("");
    return `<p class="warm__aero">${aero}</p><ul class="warm__list">${list}</ul><p class="warm__cue">${WARMUP.flatfeet}</p>${cue ? `<p class="warm__cue" style="color:var(--acc)">${cue}</p>` : ""}`;
  }
  const CREW = ["Faisal", "Yazan"];
  const MOVE_TYPES = ["Run", "Walk", "Cycle", "Swim", "Sport", "Yoga", "Mobility", "Class", "Other"];
  // Standing / no-floor mobility follow-alongs (verified embeddable YouTube IDs)
  const MOBILITY = [
    { name: "Daily tightness reset", minutes: 10, video: "ws80khBG04c", videoTitle: "10 Min Daily Mobility · All Standing — Julia Reppel" },
    { name: "Standing full-body flow", minutes: 10, video: "--CvLp8oDKM", videoTitle: "10 Min Standing Mobility Routine · Full Body — amy dot" },
    { name: "Morning wake-up", minutes: 10, video: "aRVFt79LqCM", videoTitle: "10 Min Morning Mobility · Full Body, No Equipment — Julia Reppel" }
  ];
  const TIERS = [
    { n: "Bronze", min: 0 }, { n: "Iron", min: 400 }, { n: "Steel", min: 1000 },
    { n: "Onyx", min: 2000 }, { n: "Slate", min: 3200 }, { n: "Crimson", min: 4800 }, { n: "Apex", min: 6800 }
  ];
  const JOINTS = ["Back", "Knee", "Ankle", "Shoulder"];
  const JOINT_LOAD = {
    Knee: ["goblet_squat", "leg_press", "hack_squat", "leg_extension", "wall_sit"],
    Back: ["db_rdl", "good_morning", "back_extension", "hip_thrust", "barbell_row", "t_bar_row", "one_arm_db_row", "cable_crunch", "hanging_leg_raise"],
    Ankle: ["calf_raise", "seated_calf_raise", "goblet_squat", "hack_squat", "wall_sit"],
    Shoulder: ["db_shoulder_press", "machine_shoulder_press", "arnold_press", "lateral_raise", "cable_lateral_raise", "incline_db_press", "db_bench_press", "barbell_bench_press", "machine_chest_press", "pec_deck", "pushup", "overhead_tricep_extension", "skullcrusher", "face_pull", "pullup", "chinup"]
  };
  // Marcus's progression engine — load increments (kg total) per movement
  const STEP = {
    leg_press: 5, hack_squat: 5, leg_extension: 5, seated_leg_curl: 5, hip_thrust: 5,
    machine_chest_press: 5, pec_deck: 5, machine_row: 5, barbell_row: 5, t_bar_row: 5,
    lat_pulldown: 5, neutral_grip_pulldown: 5, seated_cable_row: 5, face_pull: 5,
    machine_shoulder_press: 5, tricep_pushdown: 5, cable_curl: 5, cable_lateral_raise: 5, pallof_press: 5, cable_crunch: 5, assisted_pullup: 5,
    goblet_squat: 2.5, db_bench_press: 2.5, incline_db_press: 2.5, barbell_bench_press: 2.5, db_shoulder_press: 2.5, arnold_press: 2.5, db_rdl: 2.5,
    good_morning: 2.5, back_extension: 2.5, one_arm_db_row: 2.5, suitcase_carry: 2.5, bicep_curl: 2.5, hammer_curl: 2.5, preacher_curl: 2.5, lateral_raise: 2.5,
    overhead_tricep_extension: 2.5, skullcrusher: 2.5, calf_raise: 2.5, seated_calf_raise: 2.5,
    pushup: 0, pullup: 0, chinup: 0, hanging_leg_raise: 0, wall_sit: 0, bike_finisher: 0
  };
  // Reason lines — Marcus's voice, shown with each prescription
  const REASONS = {
    joints: "Joint flagged it. Down 20%, easy tempo, no ego.",
    deload_week: "Deload week — everything back 10%. Let the joints catch up. Non-negotiable.",
    first: "Baseline day. Start light, find your floor — not testing the ceiling.",
    deload_miss: "Reps fell off target. Back a step. We build from solid, not from grinding.",
    deload_mediocre: "Two flat sessions. Drop a step, reset, come back clean.",
    hold_mediocre: "Wasn't crisp last time. Hold here — no point loading a bad day.",
    hold_reps: "Close the gap — hit the target on every set before we add weight.",
    consolidate: "Nailed it once. Do it again at this weight, then we go up. Prove it twice.",
    hold_grind: "Reps were there but you were grinding. Hold — get it crisp before we load.",
    bump_load: "Clean last week, all reps. Up a step. Earn it.",
    resume_joints: "Joints had their day. Back to where you were.",
    resume_deload: "Deload's done — back to your working weight. No need to re-earn it."
  };

  // ---------- store ----------
  const blank = () => ({ schema: 3, started: null, onboarded: false, sessions: {}, current: null, bodyweight: [], bestRankIdx: 0, bwGoal: null, movement: [], summitShown: false });
  function load() {
    try {
      const r = localStorage.getItem(KEY); const s = r ? JSON.parse(r) : blank(); s.sessions = s.sessions || {};
      const migrated = (s.schema || 1) < CURRENT_SCHEMA;
      if (migrated) migrate(s);   // 2.5 — read the schema, upgrade old stores
      // prune empty "preview" sessions (never logged, not completed, not the active one) so they don't accumulate
      let pruned = false;
      for (const k in s.sessions) {
        const ss = s.sessions[k];
        const hasDone = Object.values(ss.exercises || {}).some(e => (e.sets || []).some(x => x.done));
        if (!hasDone && !ss.completedAt && k !== s.current) { delete s.sessions[k]; pruned = true; }
      }
      if (pruned || migrated) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
      return s;
    } catch (e) { return blank(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { flagStorageFail(); } }

  // ---------- schema / storage / escaping / backup helpers (Batch 2) ----------
  const CURRENT_SCHEMA = 3;
  function migrate(s) {
    // 3 — rank-curve rebalance (2026-07-14): the old scoring inflated the peak (warm-up ramps counted as PRs, 150/kg).
    // Re-sync bestRankIdx to the honest current tier under the new curve. One-time; the ratchet-up peak resumes after.
    if ((s.schema || 1) < 3) {
      try { s.bestRankIdx = derive(s).tierIdx; } catch (e) {}
    }
    s.schema = CURRENT_SCHEMA;
    return s;
  }
  // 2.7 — escape user text before it goes into innerHTML (a note with </textarea> must not break out)
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 2.2 — surface storage failure instead of silently dropping saves
  let storageFailed = false;
  function flagStorageFail() {
    if (storageFailed) return; storageFailed = true;
    try {
      const el = document.createElement("div");
      el.textContent = "Storage failing — back up your data now.";
      el.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:10px 16px;font-size:12px;letter-spacing:.02em;text-align:center;background:#20180f;color:#e79521;border-top:1px solid #e79521;opacity:.96";
      document.body.appendChild(el);
    } catch (e) {}
  }
  function backupAgo(iso) { const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return days <= 0 ? "today" : days === 1 ? "1 day ago" : days + " days ago"; }
  // 2.3a — mirror the store into a second on-device home (Cache API) after each finish
  async function mirrorBackup() {
    try {
      store.lastBackup = new Date().toISOString();
      if (window.caches) { const c = await caches.open("cairn-backup"); await c.put("cairn-backup.json", new Response(JSON.stringify(store), { headers: { "Content-Type": "application/json" } })); }
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
    } catch (e) {}
  }

  function dateKey(day) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}__${day}`;
  }
  function getSession(s, day) {
    // 1.3 — once a session is live, resolve by its carried key (store.current) so a midnight
    // rollover can't remint a blank session under tomorrow's date mid-workout.
    const cur = s.current && s.sessions[s.current];
    if (cur && cur.day === day && !cur.completedAt) return { key: s.current, session: cur };
    const k = dateKey(day);
    if (!s.sessions[k]) {
      s.sessions[k] = { day, date: new Date().toISOString(), week: programWeek(), feel: null, joint: null, crew: { Faisal: false, Yazan: false }, swaps: {}, exercises: {}, completedAt: null };
      // NOT saved here — a mere preview shouldn't persist a session; it's saved once a set is actually logged (persist/startSession)
    }
    return { key: k, session: s.sessions[k] };
  }

  // ---------- day routing ----------
  function isTrainingDay() { const d = new Date().getDay(); return d === 1 || d === 3 || d === 6; }
  // ---------- session rotation (calendar-independent flexibility) ----------
  const ROTATION = ["monday", "wednesday", "saturday"];
  const DAY_SHORT = { monday: "Lower", wednesday: "Upper", saturday: "Hinge" };
  let dayPick = null; // transient: the session chosen on the start card, overrides the rotation default
  function lastCompletedDay() {
    const done = Object.values(store.sessions || {}).filter(isDone)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return done.length ? done[0].day : null;
  }
  function nextInRotation() {
    const last = lastCompletedDay();
    if (!last) return "monday";
    const i = ROTATION.indexOf(last);
    return i === -1 ? "monday" : ROTATION[(i + 1) % ROTATION.length];
  }
  function plannedDay() { return dayPick || nextInRotation(); }

  // ---------- program assembly: anchors fixed (ss A/B), accessories rotate weekly (ss C) ----------
  function weekFor(day) { const s = store.sessions[dateKey(day)]; return (s && s.week) ? s.week : programWeek(); }
  function weekAccessories(day) {
    const d = PROGRAM[day]; if (!d || !d.accessories || !d.accessories.length) return [];
    const pool = d.accessories, per = Math.min(d.accPerWeek || 2, pool.length);
    const start = ((weekFor(day) - 1) * per) % pool.length, out = [];
    for (let i = 0; i < per; i++) out.push(Object.assign({}, pool[(start + i) % pool.length], { ss: "C" }));
    return out;
  }
  function progFor(day) { const d = PROGRAM[day]; if (!d) return null; return { title: d.title, subtitle: d.subtitle, exercises: (d.anchors || []).concat(weekAccessories(day)) }; }
  function allProgExercises(day) { const d = PROGRAM[day] || {}; return (d.anchors || []).concat(d.accessories || []); }
  function ssPartnerIdx(exs, idx) { const g = exs[idx] && exs[idx].ss; if (!g) return -1; for (let j = 0; j < exs.length; j++) if (j !== idx && exs[j] && exs[j].ss === g) return j; return -1; }

  // ---------- derivation (pure over store) ----------
  const epley = (w, r) => { w = +w || 0; r = +r || 0; return r > 0 ? w * (1 + r / 30) : w; };
  const doneSets = (sess) => Object.values(sess.exercises || {}).flatMap(e => (e.sets || []).filter(st => st.done));
  const isDone = (sess) => doneSets(sess).length > 0;

  const SCORE_WINDOW_DAYS = 56;   // rank counts your last ~8 weeks of training; older sessions age out (current form)
  const BW_RATE = 100;            // score points per kg lost from baseline weigh-in
  const MOVE_RATE = 2, MOVE_CAP = 120;   // movement: 2 pts/min, capped per session
  function derive(s) {
    const all = Object.values(s.sessions || {}).filter(isDone)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const prMax = {}, bestEver = {}; let totalVol = 0, totalSets = 0, prCount = 0, winSets = 0, winPR = 0;
    const cutoff = Date.now() - SCORE_WINDOW_DAYS * 86400000;
    const sessionStats = [];
    all.forEach(se => {
      const inWin = new Date(se.date).getTime() >= cutoff;
      let sv = 0;
      const sessBest = {};   // best e1rm per exercise THIS session — a lift PRs at most once per session (no warm-up ramp inflation)
      Object.keys(se.exercises || {}).forEach(exId => {
        (se.exercises[exId].sets || []).forEach(st => {
          if (!st.done) return;
          const w = +st.weight || 0, r = +st.reps || 0; if (w <= 0 && r <= 0) return;
          totalSets++; totalVol += w * r; sv += w * r;
          if (inWin) winSets++;
          const e = epley(w, r);
          if (!bestEver[exId] || e > bestEver[exId].e1rm) bestEver[exId] = { exId, weight: w, reps: r, e1rm: e, date: se.date };
          if (e > (sessBest[exId] || 0)) sessBest[exId] = e;
        });
      });
      Object.keys(sessBest).forEach(exId => {                                                   // score PRs once per lift, on the session's top set
        const e = sessBest[exId];
        if (prMax[exId] == null) prMax[exId] = e;                                               // first time you do a lift = baseline, not a PR
        else if (e > prMax[exId] + 0.01) { prMax[exId] = e; prCount++; if (inWin) winPR++; }    // beating a past session = one genuine PR
      });
      sessionStats.push({ date: se.date, day: se.day, volume: sv, sets: doneSets(se).length });
    });
    const strengthPoints = winSets * 10 + winPR * 40;   // strength — sets + PRs in the window
    // movement — any logged non-lifting session, per-minute capped, windowed (feeds current form, no PRs)
    let movePoints = 0;
    (s.movement || []).forEach(m => { if (new Date(m.date).getTime() >= cutoff) movePoints += Math.min((+m.minutes || 0) * MOVE_RATE, MOVE_CAP); });
    movePoints = Math.round(movePoints);
    const trainingPoints = strengthPoints + movePoints;   // current form — decays as it ages past the window
    // condition — weight lost from your first logged weigh-in; regain gives these points back
    const bw = s.bodyweight || [];
    const bwBase = bw.length ? bw[0].kg : null, bwNow = bw.length ? bw[bw.length - 1].kg : null;
    const kgLost = bw.length ? Math.max(0, bwBase - bwNow) : 0;
    const conditionPoints = Math.round(kgLost * BW_RATE);
    const points = trainingPoints + conditionPoints;
    let ti = 0; TIERS.forEach((t, i) => { if (points >= t.min) ti = i; });
    const cur = TIERS[ti], next = TIERS[ti + 1] || null;
    const frac = next ? Math.max(0, Math.min(1, (points - cur.min) / (next.min - cur.min))) : 1;

    // weekly volume — last 6 weeks (week starts Monday)
    const now = new Date(); const monday = new Date(now); const off = (now.getDay() + 6) % 7;
    monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - off);
    const weeks = Array.from({ length: 6 }, (_, i) => ({ vol: 0, sess: 0, start: new Date(monday.getTime() - (5 - i) * 7 * 86400000) }));
    sessionStats.forEach(ss => {
      const t = new Date(ss.date).getTime();
      for (let i = 0; i < 6; i++) {
        const a = weeks[i].start.getTime(), b = a + 7 * 86400000;
        if (t >= a && t < b) { weeks[i].vol += ss.volume; weeks[i].sess++; break; }
      }
    });
    const thisWeek = weeks[5].sess;
    const mvWkStart = weeks[5].start.getTime(), mvWkEnd = mvWkStart + 7 * 86400000;
    const moveThisWeek = (s.movement || []).filter(m => { const t = new Date(m.date).getTime(); return t >= mvWkStart && t < mvWkEnd; }).length;
    const thisMonth = all.filter(se => { const d = new Date(se.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    const prs = Object.values(bestEver).sort((a, b) => new Date(b.date) - new Date(a.date));

    return { sessions: all.length, totalVol, totalSets, prCount, points,
      trainingPoints, strengthPoints, movePoints, conditionPoints, kgLost, tierIdx: ti, cur, next, frac,
      moveThisWeek, moveTotal: (s.movement || []).length,
      weeks, thisWeek, thisMonth, prs, prMax, history: sessionStats.slice().reverse(),
      crewSessions: all.filter(se => se.crew && (se.crew.Faisal || se.crew.Yazan)).length };
  }

  function lastPerformance(s, exId) {
    const all = Object.values(s.sessions || {}).filter(isDone).sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const se of all) {
      const e = se.exercises[exId];
      if (e && (e.sets || []).some(st => st.done)) return e.sets.filter(st => st.done).map(st => ({ weight: st.weight, reps: st.reps }));
    }
    return null;
  }

  // ---------- app state ----------
  let store = load();
  const screen = document.getElementById("screen");
  const tabbar = document.getElementById("tabbar");
  let view = { name: "home" };          // home | train | exercise | guided | finish
  let guided = null;                    // guided runner state

  function setTabbar(active, hide) {
    tabbar.hidden = !!hide;
    tabbar.querySelectorAll(".tab").forEach(b => b.classList.toggle("is-active", b.dataset.tab === active));
  }

  function go(v, pushHistory = true) {
    view = v;
    if (pushHistory) history.pushState({ v: v.name }, "");
    render();
  }
  window.addEventListener("popstate", () => {
    // step back one logical level
    if (view.name === "exercise" || view.name === "finish") { view = { name: "train" }; render(); }
    else if (view.name === "progress" || view.name === "sessionEdit" || view.name === "bwEdit" || view.name === "moveEdit" || view.name === "mobility" || view.name === "settings" || view.name === "restore") { view = view.back || { name: "home" }; render(); }
    else if (view.name === "guided") { exitGuided(false); }
    else { view = { name: "home" }; render(); }
  });

  // ---------- render dispatch ----------
  function render() {
    screen.classList.remove("fade"); void screen.offsetWidth; screen.classList.add("fade");
    if (view.name === "home") { setTabbar("home", false); renderHome(); }
    else if (view.name === "train") { setTabbar("train", false); renderTrain(); }
    else if (view.name === "exercise") { setTabbar("train", false); renderExercise(view.idx); }
    else if (view.name === "progress") { setTabbar(view.back && view.back.name === "exercise" ? "train" : "home", false); renderProgress(view.exId); }
    else if (view.name === "sessionEdit") { setTabbar("home", false); renderSessionEdit(view.key); }
    else if (view.name === "bwEdit") { setTabbar("home", false); renderBwEdit(); }
    else if (view.name === "moveEdit") { setTabbar("home", false); renderMoveEdit(); }
    else if (view.name === "mobility") { setTabbar("home", false); renderMobility(); }
    else if (view.name === "settings") { setTabbar("home", false); renderSettings(); }
    else if (view.name === "restore") { setTabbar("home", false); renderRestore(); }
    else if (view.name === "guided") { setTabbar(null, true); renderGuided(); }
    else if (view.name === "finish") { setTabbar(null, true); renderFinish(); }
    window.scrollTo(0, 0);
  }

  // ---------- HOME ----------
  function bwSection() {
    const bw = store.bodyweight || [];
    if (!bw.length) return `<div class="section"><div class="section__head"><span class="section__title">Bodyweight</span></div>
      <p class="zero__sub" style="margin-top:2px">Track your weight with the lifts — for you it's the number that matters most.</p>
      <button class="btn btn--ghost" id="log-bw" style="margin-top:12px">Log weight</button><div id="bw-form" hidden style="margin-top:12px"></div></div>`;
    const latest = bw[bw.length - 1], first = bw[0], delta = Math.round((latest.kg - first.kg) * 10) / 10;
    const headline = bw.length > 1
      ? `<div class="pgbest"><span class="pgbest__v">${fmtN(Math.abs(delta))}<small>kg ${delta <= 0 ? "down" : "up"}</small></span><span class="pgbest__l">${fmtN(latest.kg)} kg now · since ${fmtDate(first.date)}</span></div>`
      : `<div class="pgbest"><span class="pgbest__v">${fmtN(latest.kg)}<small>kg</small></span><span class="pgbest__l">${fmtDate(latest.date)}</span></div>`;
    const goal = store.bwGoal;
    const toGo = goal ? Math.round((latest.kg - goal) * 10) / 10 : null;
    const goalLine = goal
      ? `<p class="bw__goal">${toGo > 0 ? `${fmtN(toGo)} kg to go · goal ${fmtN(goal)} kg` : `Goal reached — ${fmtN(goal)} kg`}</p>`
      : "";
    return `<div class="section"><div class="section__head"><span class="section__title">Bodyweight</span></div>
      ${headline}
      ${goalLine}
      ${bw.length > 1 ? lineChart(bw.map(x => x.kg)) : ""}
      <button class="btn btn--ghost" id="log-bw" style="margin-top:14px">Log weight</button><div id="bw-form" hidden style="margin-top:12px"></div>
      <button class="pglink" id="bw-goal">${goal ? "Edit goal weight" : "Set a goal weight"}</button>
      <button class="pglink" id="bw-edit">Edit entries</button></div>`;
  }
  function wireBodyweight() {
    const eb = document.getElementById("bw-edit"); if (eb) eb.addEventListener("click", () => go({ name: "bwEdit", back: { name: "home" } }));
    const gb = document.getElementById("bw-goal");
    if (gb) gb.addEventListener("click", () => {
      const raw = prompt("Goal weight in kg (leave blank to clear):", store.bwGoal ? String(store.bwGoal) : "");
      if (raw === null) return;
      if (raw.trim() === "") { store.bwGoal = null; save(store); render(); return; }
      const v = parseFloat(raw);
      if (!v || v < 30 || v > 400) { alert("Enter a weight between 30 and 400 kg."); return; }
      // 4.6 — a loss goal must be below the current weight, else "goal reached" shows falsely
      const cur = (store.bodyweight || []).length ? store.bodyweight[store.bodyweight.length - 1].kg : null;
      if (cur != null && v >= cur) { alert("Your goal should be below your current weight (" + fmtN(cur) + " kg)."); return; }
      store.bwGoal = v; save(store); render();
    });
    const btn = document.getElementById("log-bw"); if (!btn) return;
    btn.addEventListener("click", () => {
      const box = document.getElementById("bw-form"), bw = store.bodyweight || [];
      box.hidden = false; btn.hidden = true;
      box.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><input class="stepper__f" id="bw-input" inputmode="decimal" placeholder="kg" style="width:110px;text-align:left;font-size:30px"><button class="btn btn--solid" id="bw-save" style="width:auto;padding:12px 26px">Save</button></div>`;
      const inp = document.getElementById("bw-input"); inp.value = bw.length ? bw[bw.length - 1].kg : ""; inp.focus();
      document.getElementById("bw-save").addEventListener("click", () => {
        const v = parseFloat(inp.value); if (!v || v < 20 || v > 400) return;
        store.bodyweight = store.bodyweight || []; store.bodyweight.push({ date: new Date().toISOString(), kg: v }); save(store); render();
      });
    });
  }
  function renderBwEdit() {
    const bw = store.bodyweight || [];
    screen.innerHTML = `
      <button class="back" id="bw-back">Back</button>
      <p class="exhead__idx">Bodyweight</p>
      <h1 class="exhead__name">History</h1>
      ${bw.length > 1 ? lineChart(bw.map(x => x.kg)) : ""}
      ${store.bwGoal ? `<p class="rank__break" style="margin-top:12px">Goal ${fmtN(store.bwGoal)} kg${bw.length ? ` · ${fmtN(Math.max(0, Math.round((bw[bw.length - 1].kg - store.bwGoal) * 10) / 10))} to go` : ""}</p>` : ""}
      <div class="logger" id="bw-list" style="margin-top:20px"></div>
      <button class="btn btn--ghost" id="log-bw" style="margin-top:20px">Log weight</button><div id="bw-form" hidden style="margin-top:12px"></div>
      <button class="pglink" id="bw-goal">${store.bwGoal ? "Edit goal weight" : "Set a goal weight"}</button>
    `;
    document.getElementById("bw-back").addEventListener("click", () => history.back());
    renderBwRows();
    wireBodyweight();
  }
  function renderBwRows() {
    const box = document.getElementById("bw-list"); if (!box) return;
    const bw = store.bodyweight || []; box.innerHTML = "";
    if (!bw.length) { box.innerHTML = `<p class="muted" style="font-size:13px">No entries yet.</p>`; return; }
    bw.map((e, i) => ({ e, i })).reverse().forEach(({ e, i }) => {
      const idx = i;
      const row = document.createElement("div"); row.className = "setrow";
      row.innerHTML = `
        <span class="setrow__n" style="width:66px">${fmtDate(e.date)}</span>
        <span class="stepper"><button class="stepper__b" data-d="-0.5">&minus;</button><input class="stepper__f" inputmode="decimal" value="${e.kg}"><span class="stepper__u">kg</span><button class="stepper__b" data-d="0.5">+</button></span>
        <button class="setrow__log is-off" data-del style="width:auto;padding:0 12px">Remove</button>`;
      const inp = row.querySelector("input");
      // 4.6 — stepper edits now re-render so the chart / delta / goal line above update immediately
      row.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => { const nv = Math.max(0, (parseFloat(inp.value) || 0) + parseFloat(b.dataset.d)); inp.value = nv; store.bodyweight[idx].kg = nv || 0; save(store); renderBwEdit(); }));
      inp.addEventListener("input", () => { const v = parseFloat(inp.value); if (v > 0) { store.bodyweight[idx].kg = v; save(store); } });
      row.querySelector("[data-del]").addEventListener("click", () => { if (!confirm("Remove this weigh-in?")) return; store.bodyweight.splice(idx, 1); save(store); renderBwEdit(); });
      box.appendChild(row);
    });
  }
  // ---------- MOVEMENT (non-lifting activity) ----------
  function moveSection() {
    const mv = (store.movement || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = mv.slice(0, 4);
    return `<div class="section"><div class="section__head"><span class="section__title">Movement</span>${mv.length ? `<span class="section__aside">counts toward form</span>` : ""}</div>
      ${recent.length
        ? `<div class="hist">${recent.map(m => `<div class="hist__row" style="cursor:default"><span class="hist__day">${m.type}</span><span class="hist__meta">${fmtDate(m.date)} · ${m.minutes} min${m.note ? " · " + esc(m.note) : ""}</span></div>`).join("")}</div>`
        : `<p class="zero__sub" style="margin-top:2px">A run, a match, a walk, a yoga flow — anything that isn't the barbell still counts toward your rank.</p>`}
      <button class="btn btn--ghost" id="log-move" style="margin-top:14px">Log movement</button><div id="move-form" hidden style="margin-top:12px"></div>
      <button class="pglink" id="mob-link">Mobility flow · standing videos</button>
      ${mv.length ? `<button class="pglink" id="move-edit">Edit entries</button>` : ""}</div>`;
  }
  function wireMovement() {
    const me = document.getElementById("move-edit"); if (me) me.addEventListener("click", () => go({ name: "moveEdit", back: { name: "home" } }));
    const ml = document.getElementById("mob-link"); if (ml) ml.addEventListener("click", () => go({ name: "mobility", back: { name: "home" } }));
    const btn = document.getElementById("log-move"); if (!btn) return;
    btn.addEventListener("click", () => {
      const box = document.getElementById("move-form"); box.hidden = false; btn.hidden = true;
      let selType = "Run", yday = false;
      box.innerHTML = `
        <div class="pick" id="move-types" style="flex-wrap:wrap">${MOVE_TYPES.map(t => `<button class="pick__chip ${t === selType ? "is-sel" : ""}" data-mt="${t}" style="flex:0 0 auto">${t}</button>`).join("")}</div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:12px"><input class="stepper__f" id="move-min" inputmode="numeric" placeholder="min" style="width:96px;text-align:left;font-size:26px"><span class="stepper__u" style="width:auto">min</span><button class="feel__opt" id="move-yday" style="width:auto;padding:11px 18px">Yesterday</button><button class="btn btn--solid" id="move-save" style="width:auto;padding:12px 24px">Save</button></div>
        <input class="note" id="move-note" placeholder="Note (optional)" style="min-height:auto;margin-top:10px">`;
      box.querySelectorAll("[data-mt]").forEach(b => b.addEventListener("click", () => { selType = b.dataset.mt; box.querySelectorAll("[data-mt]").forEach(x => x.classList.toggle("is-sel", x.dataset.mt === selType)); }));
      // 4.7 — backdate to yesterday without a full date picker
      document.getElementById("move-yday").addEventListener("click", (e) => { yday = !yday; e.currentTarget.classList.toggle("is-sel", yday); });
      document.getElementById("move-save").addEventListener("click", () => {
        const min = parseInt(document.getElementById("move-min").value, 10);
        if (!min || min < 1 || min > 600) return;
        const note = document.getElementById("move-note").value.trim();
        const dt = new Date(); if (yday) dt.setDate(dt.getDate() - 1);
        store.movement = store.movement || [];
        store.movement.push({ date: dt.toISOString(), type: selType, minutes: min, note });
        save(store); render();
      });
      document.getElementById("move-min").focus();
    });
  }
  function renderMoveEdit() {
    screen.innerHTML = `
      <button class="back" id="mv-back">Back</button>
      <p class="exhead__idx">Movement</p>
      <h1 class="exhead__name">Log a session</h1>
      <button class="btn btn--ghost" id="log-move" style="margin-top:6px">Log movement</button><div id="move-form" hidden style="margin-top:12px"></div>
      <button class="pglink" id="mob-link">Mobility flow · standing videos</button>
      <div class="logger" id="mv-list" style="margin-top:20px"></div>`;
    document.getElementById("mv-back").addEventListener("click", () => history.back());
    renderMoveRows();
    wireMovement();
  }
  function renderMoveRows() {
    const box = document.getElementById("mv-list"); if (!box) return;
    const mv = store.movement || []; box.innerHTML = "";
    if (!mv.length) { box.innerHTML = `<p class="muted" style="font-size:13px">No entries yet.</p>`; return; }
    mv.map((e, i) => ({ e, i })).reverse().forEach(({ e, i }) => {
      const row = document.createElement("div"); row.className = "setrow";
      row.innerHTML = `<span class="setrow__n" style="width:auto;flex:1">${e.type} · ${e.minutes} min<span style="display:block;color:var(--mut);font-size:11px;margin-top:2px">${fmtDate(e.date)}${e.note ? " · " + esc(e.note) : ""}</span></span>
        <button class="setrow__log is-off" data-del style="width:auto;padding:0 12px">Remove</button>`;
      row.querySelector("[data-del]").addEventListener("click", () => { if (!confirm("Remove this entry?")) return; store.movement.splice(i, 1); save(store); renderMoveEdit(); });
      box.appendChild(row);
    });
  }
  function renderMobility() {
    screen.innerHTML = `
      <button class="back" id="mob-back">Back</button>
      <p class="exhead__idx">Movement</p>
      <h1 class="exhead__name">Mobility</h1>
      <p class="exhead__cue">Standing, gym-friendly, no floor. Follow one, then log it — it counts toward your rank like any session.</p>
      ${MOBILITY.map((m, i) => `
        <div class="section" style="margin-top:26px">
          <div class="excard__top"><span class="excard__name" style="font-size:21px">${m.name}</span><span class="excard__scheme">${m.minutes} min</span></div>
          <div class="demo" data-vid="${m.video}" style="margin-top:12px">
            <img class="demo__poster" src="https://i.ytimg.com/vi/${m.video}/hqdefault.jpg" alt="" onerror="this.style.display='none'">
            <div class="demo__play"><span class="demo__playlabel">Play</span></div>
          </div>
          <p class="demo__cap">${m.videoTitle}</p>
          <button class="btn btn--outline" data-logmob="${i}" style="margin-top:12px">Log this · ${m.minutes} min</button>
        </div>`).join("")}
      <div style="height:20px"></div>`;
    document.getElementById("mob-back").addEventListener("click", () => history.back());
    screen.querySelectorAll(".demo").forEach(d => wireDemo(d));
    screen.querySelectorAll("[data-logmob]").forEach(b => b.addEventListener("click", () => {
      const m = MOBILITY[+b.dataset.logmob];
      store.movement = store.movement || [];
      store.movement.push({ date: new Date().toISOString(), type: "Mobility", minutes: m.minutes, note: m.name });
      save(store); buzz(); view = { name: "home" }; render();
    }));
  }

  function rankStackSVG() {
    return `<svg width="120" height="182" viewBox="0 0 120 182" fill="none">
      <ellipse class="stone" cx="60" cy="168" rx="50" ry="14" fill="#e79521"/>
      <ellipse class="stone" cx="58" cy="144" rx="42" ry="13" fill="#eea22f"/>
      <ellipse class="stone" cx="61" cy="122" rx="35" ry="12" fill="#e79521"/>
      <ellipse class="stone" cx="59" cy="102" rx="29" ry="11" fill="#eea22f"/>
      <ellipse class="stone" cx="60" cy="85" rx="23" ry="10" fill="#f1efe8"/>
      <ellipse cx="60" cy="68" rx="17" ry="8" fill="none" stroke="#5a4a2c" stroke-width="1.4" stroke-dasharray="3 4"/>
    </svg>`;
  }
  function totalTrainMs() {
    let ms = 0;
    Object.values(store.sessions || {}).forEach(se => {
      if (!se.completedAt) return;
      const dur = new Date(se.completedAt).getTime() - new Date(se.startedAt || se.date).getTime();
      if (dur > 0 && dur < 6 * 3600000) ms += dur;   // cap 6h to ignore stale preview timestamps
    });
    return ms;
  }
  function fmtDur(ms) { const m = Math.round(ms / 60000); const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; }
  function bwTileHTML(now, first, delta, goal) {
    const lost = Math.max(0, first - now);
    let bar = "", row = "";
    if (goal) {
      const span = Math.max(1, first - goal), pct = Math.max(0, Math.min(100, (lost / span) * 100));
      const toGo = Math.round((now - goal) * 10) / 10;
      bar = `<div class="nh-bwbar"><span style="width:${pct.toFixed(0)}%"></span></div>`;
      row = `<div class="nh-bwrow"><span>${fmtN(first)} start</span><span>${toGo > 0 ? `<b style="color:var(--acc)">${fmtN(toGo)} kg</b> to goal · ${fmtN(goal)}` : `goal reached · ${fmtN(goal)}`}</span></div>`;
    } else {
      row = `<div class="nh-bwrow"><span>${fmtN(first)} start</span><span style="color:var(--acc-deep)">tap to set a goal</span></div>`;
    }
    return `<button class="nh-tile wide" id="bw-tile"><div class="nh-th"><span>Bodyweight · your #1</span><span class="nh-go">+</span></div>
      <div class="nh-bwtop"><span class="nh-big" style="margin-top:0">${fmtN(now)}<small> kg</small></span><span style="color:var(--acc);font-size:13px">${fmtN(Math.abs(delta))} kg ${delta <= 0 ? "down" : "up"} since start</span></div>
      ${bar}${row}</button>`;
  }
  function renderHome() {
    const d = derive(store); updateBestRank(d);
    const doneDesc = Object.values(store.sessions || {}).filter(isDone).sort((a, b) => new Date(b.date) - new Date(a.date));
    let crewStreak = 0; for (const s of doneDesc) { if (s.crew && (s.crew.Faisal || s.crew.Yazan)) crewStreak++; else break; }
    const resume = store.current && store.sessions[store.current] && !store.sessions[store.current].completedAt && isDone(store.sessions[store.current]);
    const startDay = resume ? store.sessions[store.current].day : plannedDay();
    const prog = progFor(startDay) || {}; const exCount = (prog.exercises || []).length;

    if (d.sessions === 0 && !resume && !(store.bodyweight || []).length && !(store.movement || []).length) { renderHomeZero(startDay, (prog.title || "Session")); return; }

    const bw = store.bodyweight || [];
    const bwNow = bw.length ? bw[bw.length - 1].kg : null, bwFirst = bw.length ? bw[0].kg : null;
    const bwDelta = bw.length ? Math.round((bwNow - bwFirst) * 10) / 10 : 0;
    const goal = store.bwGoal;
    const bwTile = bw.length ? bwTileHTML(bwNow, bwFirst, bwDelta, goal)
      : `<button class="nh-tile wide" id="bw-tile"><div class="nh-th"><span>Bodyweight · your #1</span><span class="nh-go">+</span></div><div class="nh-sub" style="margin-top:10px">Log your weight — for you it's the number that matters most. Tap to start.</div></button>`;

    const bestLift = d.prs.slice().sort((a, b) => b.e1rm - a.e1rm)[0];
    const bestName = bestLift ? (EXERCISE_LIBRARY[bestLift.exId] || { name: bestLift.exId }).name : "—";
    const dots = Array.from({ length: 3 }, (_, i) => `<i class="${i < d.thisWeek ? "on" : ""}"></i>`).join("");
    const maxVol = Math.max(1, ...d.weeks.map(w => w.vol));
    const volBars = d.weeks.map(w => `<i class="${w.vol > 0 ? "on" : ""}" style="height:${Math.max(6, (w.vol / maxVol) * 100)}%"></i>`).join("");
    const showCells = d.weeks.map(w => { const lv = w.sess >= 3 ? "l3" : w.sess === 2 ? "l2" : w.sess === 1 ? "l1" : ""; return Array.from({ length: 3 }, (_, i) => `<span class="weeks__cell ${i < w.sess ? lv : ""}"></span>`).join(""); }).join("");
    const moveMin = (store.movement || []).reduce((a, m) => a + (+m.minutes || 0), 0);
    const wkLabel = store.started ? ` · Wk ${programWeek()}${programWeek() <= 6 ? "/6" : ""}` : "";

    screen.innerHTML = `
      <div class="home__top"><span class="home__brand">Cairn</span><span class="kicker">${fmtDate(new Date().toISOString())}${wkLabel}</span></div>

      <div class="nh-hero-wrap" id="hero-wrap">
        <div class="nh-hero">
          ${rankStackSVG()}
          <div class="nh-rk">
            <p class="kicker">Your standing</p>
            <h1 class="rank__tier">${d.cur.n}</h1>
            <div class="meter"><span class="meter__fill" id="home-meter"></span></div>
            <p class="rank__pts" style="margin-top:10px">${d.points} points · <b style="color:var(--acc);font-weight:400">${d.next ? `${Math.max(0, d.next.min - d.points)} to ${d.next.n}` : "Apex"}</b></p>
            ${store.bestRankIdx > d.tierIdx ? `<p class="rank__peak" style="margin-top:6px">Peak · ${TIERS[store.bestRankIdx].n}</p>` : ""}
            <span class="nh-climb" id="climb">See the climb <span class="nh-chev">›</span></span>
          </div>
        </div>
        <div class="nh-hladder">
          <div class="ladder">${TIERS.map((t, i) => { const cur = t.n === d.cur.n, pk = i === store.bestRankIdx && store.bestRankIdx > d.tierIdx; return `<div class="ladder__row ${cur ? "is-cur" : ""} ${pk ? "is-peak" : ""}"><span class="ladder__n">${t.n}</span><span class="ladder__p">${i <= d.tierIdx ? "placed" : t.min + " pts"}</span></div>`; }).join("")}</div>
        </div>
      </div>

      <div class="nh-card">
        <div class="ct">${resume ? "Resume" : "Start"} · ${DAY_SHORT[startDay]}</div>
        <div class="cs">${exCount} exercises · ${d.thisWeek} of 3 this week</div>
        <button class="btn btn--solid" id="start-btn" style="margin-top:14px">${resume ? "Resume session" : "Start guided session"}</button>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Workouts</span><span class="r">tap to view</span></div>
        ${ROTATION.map(dk => `<button class="nh-logrow" data-day="${dk}"><div><div class="lt">${DAY_SHORT[dk]}${dk === startDay ? " · next" : ""}</div><div class="ls">${(PROGRAM[dk].title.split(" — ")[1] || "").trim()} · ${progFor(dk).exercises.length} moves</div></div><span class="nh-go">›</span></button>`).join("")}
      </div>

      <div class="nh-grid">
        ${bwTile}
        <div class="nh-tile"><div class="nh-th"><span>This week</span><span style="color:var(--acc)">${d.thisWeek}/3</span></div><div class="nh-dots">${dots}</div></div>
        <div class="nh-tile"><div class="nh-th"><span>Crew streak</span></div><div class="nh-big">${crewStreak}</div><div class="nh-sub">${crewStreak > 1 ? "Don't break it" : "in a row"}</div></div>
        <button class="nh-tile" ${bestLift ? `data-prex="${bestLift.exId}"` : ""}><div class="nh-th"><span>Best lift</span>${bestLift ? '<span class="nh-go">›</span>' : ""}</div><div class="nh-big" style="font-size:19px">${bestName}</div><div class="nh-sub">${bestLift ? `${fmtN(bestLift.weight)} kg × ${bestLift.reps}` : "no PRs yet"}</div></button>
        <div class="nh-tile"><div class="nh-th"><span>Volume</span><span>6 wk</span></div><div class="nh-bars">${volBars}</div></div>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Showing up</span><span class="r">${store.started ? `${phaseName()} · Wk ${programWeek()}${programWeek() <= 6 ? " of 6" : ""}` : phaseName()}</span></div>
        <div class="weeks">${showCells}</div>
        <p class="nh-showline"><b>${d.thisWeek} of 3</b> this week · <b>${d.thisMonth} sessions</b> this month</p>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">All-time${store.started ? ` · since ${fmtDate(store.started)}` : ""}</span></div>
        <div class="nh-grid" style="margin-top:0">
          <div class="nh-tile"><div class="nh-th"><span>Sessions</span></div><div class="nh-big">${d.sessions}</div></div>
          <div class="nh-tile"><div class="nh-th"><span>Kg lifted</span></div><div class="nh-big">${fmtVol(d.totalVol)}</div></div>
          <div class="nh-tile"><div class="nh-th"><span>Personal bests</span></div><div class="nh-big">${d.prCount}</div></div>
          <div class="nh-tile"><div class="nh-th"><span>Total time</span></div><div class="nh-big" style="font-size:24px">${fmtDur(totalTrainMs())}</div><div class="nh-sub">under the bar</div></div>
        </div>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Log</span></div>
        <button class="nh-logrow" id="log-move-row"><div><div class="lt">Movement</div><div class="ls">${d.moveThisWeek} this week${moveMin ? ` · ${moveMin} min total` : ""}</div></div><span class="nh-go">+</span></button>
        <button class="nh-logrow" id="log-mob-row"><div><div class="lt">Mobility flow</div><div class="ls">standing videos · no floor</div></div><span class="nh-go">›</span></button>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Recent sessions</span></div>
        ${(function () {
          const done = Object.entries(store.sessions || {}).filter(e => isDone(e[1])).sort((a, b) => new Date(b[1].date) - new Date(a[1].date)).slice(0, 6);
          if (!done.length) return `<p class="nh-showline" style="opacity:.55">Logged workouts appear here — tap one to edit its sets or delete it.</p>`;
          return done.map(e => { const s = e[1]; const n = Object.values(s.exercises || {}).filter(x => (x.sets || []).some(y => y.done)).length; return `<button class="nh-logrow" data-sess="${e[0]}"><div><div class="lt">${DAY_SHORT[s.day] || s.day}</div><div class="ls">${fmtDate(s.date)} · ${n} exercise${n === 1 ? "" : "s"} · tap to edit or delete</div></div><span class="nh-go">›</span></button>`; }).join("");
        })()}
      </div>

      <div class="nh-sect">
        <div class="nh-shead" style="align-items:center"><span class="l">The numbers</span><div class="nh-seg"><button class="on" data-seg="points">Points</button><button data-seg="raw">Stats</button></div></div>
        <div class="nh-lgblock" id="lgblock">
          <div class="nh-lgrow"><div><div class="nh-ln">Strength</div><div class="nh-lsub">sets + PRs · last 8 wks</div></div><div><span class="lp"><div class="nh-lv">${d.strengthPoints}</div><div class="nh-ld">pts</div></span><span class="lr"><div class="nh-lv">${fmtVol(d.totalVol)}</div><div class="nh-ld">kg lifted</div></span></div></div>
          <div class="nh-lgrow"><div><div class="nh-ln">Movement</div><div class="nh-lsub">runs · sport · mobility</div></div><div><span class="lp"><div class="nh-lv">${d.movePoints}</div><div class="nh-ld">pts</div></span><span class="lr"><div class="nh-lv">${moveMin}</div><div class="nh-ld">minutes</div></span></div></div>
          <div class="nh-lgrow"><div><div class="nh-ln">Bodyweight</div><div class="nh-lsub">${bwNow ? `${fmtN(bwNow)} kg${goal ? ` · goal ${fmtN(goal)}` : ""}` : "not logged"}</div></div><div><span class="lp"><div class="nh-lv">${d.conditionPoints}</div><div class="nh-ld">pts</div></span><span class="lr"><div class="nh-lv">${bwDelta <= 0 ? "−" : "+"}${fmtN(Math.abs(bwDelta))}</div><div class="nh-ld">kg</div></span></div></div>
        </div>
      </div>

      <div class="foot"><span class="foot__link">Cairn</span><button class="foot__link" id="settings-btn">Settings</button></div>
    `;

    requestAnimationFrame(() => { const m = document.getElementById("home-meter"); if (m) m.style.width = (d.frac * 100).toFixed(1) + "%"; });
    document.getElementById("start-btn").addEventListener("click", () => startSession(startDay));
    document.getElementById("climb").addEventListener("click", () => document.getElementById("hero-wrap").classList.toggle("open"));
    document.getElementById("settings-btn").addEventListener("click", () => go({ name: "settings", back: { name: "home" } }));
    screen.querySelectorAll("[data-prex]").forEach(b => b.addEventListener("click", () => go({ name: "progress", exId: b.dataset.prex, back: { name: "home" } })));
    document.querySelectorAll("[data-seg]").forEach(b => b.addEventListener("click", () => { const blk = document.getElementById("lgblock"); blk.classList.toggle("raw", b.dataset.seg === "raw"); document.querySelectorAll("[data-seg]").forEach(x => x.classList.toggle("on", x === b)); }));
    const bwt = document.getElementById("bw-tile"); if (bwt) bwt.addEventListener("click", () => go({ name: "bwEdit", back: { name: "home" } }));
    const lmr = document.getElementById("log-move-row"); if (lmr) lmr.addEventListener("click", () => go({ name: "moveEdit", back: { name: "home" } }));
    const lmb = document.getElementById("log-mob-row"); if (lmb) lmb.addEventListener("click", () => go({ name: "mobility", back: { name: "home" } }));
    screen.querySelectorAll("[data-sess]").forEach(b => b.addEventListener("click", () => go({ name: "sessionEdit", key: b.dataset.sess, back: { name: "home" } })));
    screen.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => { dayPick = b.dataset.day; go({ name: "train" }); }));
  }

  function renderHomeZero(day, title) {
    const prog = progFor(day) || {}; const exCount = (prog.exercises || []).length;
    screen.innerHTML = `
      <div class="home__top"><span class="home__brand">Cairn</span><span class="kicker">${fmtDate(new Date().toISOString())}</span></div>

      <div class="nh-hero-wrap" id="hero-wrap">
        <div class="nh-hero">
          ${rankStackSVG()}
          <div class="nh-rk">
            <p class="kicker">Your standing</p>
            <h1 class="rank__tier">Bronze</h1>
            <div class="meter"><span class="meter__fill" style="width:0"></span></div>
            <p class="rank__pts" style="margin-top:10px">0 points · <b style="color:var(--acc);font-weight:400">400 to Iron</b></p>
            <span class="nh-climb" id="climb">See the climb <span class="nh-chev">›</span></span>
          </div>
        </div>
        <div class="nh-hladder">
          <div class="ladder">${TIERS.map((t, i) => `<div class="ladder__row ${i === 0 ? "is-cur" : ""}"><span class="ladder__n">${t.n}</span><span class="ladder__p">${t.min} pts</span></div>`).join("")}</div>
        </div>
      </div>

      <div class="nh-card">
        <div class="ct">Start · ${DAY_SHORT[day]}</div>
        <div class="cs">${exCount} exercises · your first session</div>
        <button class="btn btn--solid" id="start-btn" style="margin-top:14px">Start session one</button>
      </div>

      <p class="zero__line" style="margin-top:26px">This is the starting line.</p>
      <p class="zero__sub">Log your first set — or just your weight — and it all begins filling in: rank, the climb, every personal best.</p>

      <div class="nh-grid">
        <button class="nh-tile wide" id="bw-tile"><div class="nh-th"><span>Bodyweight · your #1</span><span class="nh-go">+</span></div><div class="nh-sub" style="margin-top:10px">The number that matters most to you. Tap to log your first weigh-in.</div></button>
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Workouts</span><span class="r">tap to view</span></div>
        ${ROTATION.map(dk => `<button class="nh-logrow" data-day="${dk}"><div><div class="lt">${DAY_SHORT[dk]}${dk === day ? " · next" : ""}</div><div class="ls">${(PROGRAM[dk].title.split(" — ")[1] || "").trim()} · ${progFor(dk).exercises.length} moves</div></div><span class="nh-go">›</span></button>`).join("")}
      </div>

      <div class="nh-sect">
        <div class="nh-shead"><span class="l">Log</span></div>
        <button class="nh-logrow" id="log-move-row"><div><div class="lt">Movement</div><div class="ls">a run, a match, a walk, a yoga flow</div></div><span class="nh-go">+</span></button>
        <button class="nh-logrow" id="log-mob-row"><div><div class="lt">Mobility flow</div><div class="ls">standing videos · no floor</div></div><span class="nh-go">›</span></button>
      </div>

      <div class="foot"><span class="foot__link">Cairn</span><button class="foot__link" id="settings-btn">Settings</button></div>`;
    document.getElementById("start-btn").addEventListener("click", () => startSession(day));
    document.getElementById("climb").addEventListener("click", () => document.getElementById("hero-wrap").classList.toggle("open"));
    document.getElementById("settings-btn").addEventListener("click", () => go({ name: "settings", back: { name: "home" } }));
    document.getElementById("bw-tile").addEventListener("click", () => go({ name: "bwEdit", back: { name: "home" } }));
    document.getElementById("log-move-row").addEventListener("click", () => go({ name: "moveEdit", back: { name: "home" } }));
    document.getElementById("log-mob-row").addEventListener("click", () => go({ name: "mobility", back: { name: "home" } }));
    screen.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => { dayPick = b.dataset.day; go({ name: "train" }); }));
  }

  // ---------- TRAIN (session overview) ----------
  function startSession(day) {
    dayPick = null;
    let { key, session } = getSession(store, day);
    // 1.4 — the resolved session is already finished (repeat on a done day): branch a fresh one
    if (session.completedAt) {
      if (!confirm("Already done today — start again?")) return;
      let n = 2; const b = dateKey(day); while (store.sessions[b + "__" + n]) n++;
      key = b + "__" + n;
      store.sessions[key] = { day, date: new Date().toISOString(), week: programWeek(), feel: null, joint: null, crew: { Faisal: false, Yazan: false }, swaps: {}, exercises: {}, completedAt: null };
    }
    store.current = key; if (!store.started) store.started = new Date().toISOString(); save(store);
    primeAudio();
    startGuided();   // straight into the guided flow — which now opens with warm-up + session preview
  }

  function currentDay() {
    if (store.current && store.sessions[store.current]) return store.sessions[store.current].day;
    return plannedDay();   // preview follows the session picker / rotation, not the calendar day
  }

  function renderTrain() {
    const day = currentDay();
    const prog = progFor(day); if (!prog) { view = { name: "home" }; renderHome(); return; }
    const { session } = getSession(store, day);
    const active = !!(store.current && store.sessions[store.current] && store.sessions[store.current].day === day && !store.sessions[store.current].completedAt);

    screen.innerHTML = `
      <div class="shead">
        <p class="kicker">${phaseName()} · ${progWeekLabel()} · ${active ? fmtDate(new Date().toISOString()) : "preview"}</p>
        <h1 class="shead__day">${prog.title.split(" — ")[0]}</h1>
        <p class="shead__sub">${prog.subtitle}</p>
      </div>
      ${isDeloadWeek(programWeek()) ? `<div class="warm" style="border-color:var(--acc)"><p class="warm__t">Deload week</p><p class="warm__aero">Still train — same days, same reps, just 10% lighter. This is the week your tendons and joints catch up to the muscle. Don't skip it, and don't chase weight.</p></div>` : ""}

      <div class="feel">
        <p class="section__title">How does it feel?</p>
        <div class="feel__opts" id="feel-opts">
          ${FEEL_OPTIONS.map(o => `<button class="feel__opt ${session.feel === o.id ? "is-sel" : ""}" data-feel="${o.id}">${o.label}</button>`).join("")}
        </div>
        <p class="feel__note" id="feel-note">${(FEEL_OPTIONS.find(o => o.id === session.feel) || {}).note || ""}</p>
        <div class="joints" id="joints" ${session.feel === "joints" ? "" : "hidden"}>
          ${JOINTS.map(j => `<button class="joints__b ${session.joint === j ? "is-sel" : ""}" data-joint="${j}">${j}</button>`).join("")}
        </div>
      </div>

      <div class="section" style="margin-top:24px">
        <p class="section__title">Who's in</p>
        <div class="crew">
          ${CREW.map(c => `<button class="crew__chip ${session.crew[c] ? "is-in" : ""}" data-crew="${c}">${c}<small>${session.crew[c] ? "In" : "Out"}</small></button>`).join("")}
        </div>
      </div>

      <div class="warm"><p class="warm__t">Warm-up first</p>${warmupFor(day, session)}</div>

      <div class="exlist">
        ${prog.exercises.map((ex, i) => {
          const exId = effId(session, i, ex); const lib = EXERCISE_LIBRARY[exId]; if (!lib) return "";
          const st = ensureSets(session, exId, ex.sets, lastPerformance(store, exId), ex);
          const last = lastPerformance(store, exId);
          const lastStr = last ? "Last: " + last.map(x => `${fmtN(x.weight)}×${x.reps}`).join(", ") : "First time";
          const flagged = session.feel === "joints" && session.joint && (JOINT_LOAD[session.joint] || []).includes(exId);
          const scheme = st.completed ? '<span class="excard__check">done</span>' : schemeLine(ex, st);
          const _groupStart = i === 0 || (prog.exercises[i - 1] || {}).ss !== ex.ss;
          const _header = _groupStart && ex.ss ? `<p style="margin:20px 2px 7px;font-size:.7rem;letter-spacing:.09em;text-transform:uppercase;opacity:.5">${ex.ss === "C" ? "Finisher" : "Superset " + ex.ss} — do the two together, rest after both</p>` : "";
          return _header + `<button class="excard ${st.completed ? "is-done" : ""}" data-ex="${i}">
            <div class="excard__top"><span class="excard__name">${lib.name}${exId !== ex.id ? ' <span class="sw">swap</span>' : ""}</span><span class="excard__scheme">${scheme}</span></div>
            <div class="excard__last">${lastStr}</div>
            ${setupNote(exId) ? `<div class="excard__setup">${esc(setupNote(exId))}</div>` : ""}
            ${!st.completed && st.reason ? `<div class="coach">${st.reason}</div>` : ""}
            ${flagged ? `<div class="excard__last accent">Ease off or swap — ${session.joint.toLowerCase()} flagged today</div>` : ""}
          </button>`;
        }).join("")}
      </div>

      <div style="height:96px"></div>
      <div class="trainbar"><button class="btn btn--solid" id="guide-btn">Start guided session</button></div>
    `;

    screen.querySelectorAll("[data-feel]").forEach(b => b.addEventListener("click", () => {
      const { session } = getSession(store, day); session.feel = session.feel === b.dataset.feel ? null : b.dataset.feel;
      if (session.feel !== "joints") session.joint = null;
      // re-scale prefilled weights for any exercise not yet logged so the deload is felt immediately
      Object.keys(session.exercises).forEach(exId => { const e = session.exercises[exId]; if (!(e.sets || []).some(s => s.done)) delete session.exercises[exId]; });
      save(store); renderTrain();
    }));
    screen.querySelectorAll("[data-joint]").forEach(b => b.addEventListener("click", () => {
      const { session } = getSession(store, day); session.joint = session.joint === b.dataset.joint ? null : b.dataset.joint; save(store); renderTrain();
    }));
    screen.querySelectorAll("[data-crew]").forEach(b => b.addEventListener("click", () => {
      const { session } = getSession(store, day); session.crew[b.dataset.crew] = !session.crew[b.dataset.crew]; save(store); renderTrain();
    }));
    screen.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => go({ name: "exercise", idx: +b.dataset.ex })));
    document.getElementById("guide-btn").addEventListener("click", startGuided);
  }

  // ---------- PROGRESS (per-exercise) ----------
  function exSessions(exId) {
    const out = [];
    Object.values(store.sessions || {}).forEach(se => {
      const e = se.exercises && se.exercises[exId]; if (!e || !e.sets) return;
      const done = e.sets.filter(s => s.done); if (!done.length) return;
      const top = done.reduce((a, b) => epley(b.weight, b.reps) >= epley(a.weight, a.reps) ? b : a);
      out.push({ date: se.date, day: se.day, sets: done.map(s => ({ weight: +s.weight || 0, reps: +s.reps || 0 })), topW: +top.weight || 0, topR: +top.reps || 0, e1rm: epley(top.weight, top.reps) });
    });
    out.sort((a, b) => new Date(a.date) - new Date(b.date));
    return out;
  }
  function findEx(exId) {
    for (const day of ["monday", "wednesday", "saturday"]) { const f = allProgExercises(day).find(e => e.id === exId); if (f) return f; }
    return { id: exId, reps: "10", sets: 3, target: "" };
  }
  function lineChart(vals) {
    if (!vals.length) return `<p class="muted" style="font-size:13px;margin-top:8px">No data yet — log this lift and watch it climb.</p>`;
    const w = 300, h = 96, pad = 10, min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 1;
    const pts = vals.map((v, i) => [pad + (vals.length === 1 ? 0.5 : i / (vals.length - 1)) * (w - 2 * pad), pad + (1 - (v - min) / rng) * (h - 2 * pad)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z`;
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6"/>`).join("");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path class="spark__area" d="${area}"/><path class="spark__line" d="${line}"/>${dots}</svg>`;
  }
  function renderProgress(exId) {
    const lib = EXERCISE_LIBRARY[exId] || { name: exId };
    const s = exSessions(exId);
    const best = s.length ? s.reduce((a, b) => b.e1rm >= a.e1rm ? b : a) : null;
    const p = prescribe(exId, findEx(exId), { feel: null });
    screen.innerHTML = `
      <button class="back" id="pg-back">Back</button>
      <p class="exhead__idx">Progress</p>
      <h1 class="exhead__name">${lib.name}</h1>
      ${best ? `<div class="pgbest"><span class="pgbest__v">${fmtN(best.topW)}<small>kg × ${best.topR}</small></span><span class="pgbest__l">Best · ${fmtDate(best.date)}</span></div>` : ""}
      ${s.length > 1 ? `<p class="muted" style="font-size:12px;margin-top:6px">Up ${fmtN(Math.max(0, best.topW - s[0].topW))} kg since session one</p>` : ""}
      ${lineChart(s.map(x => x.e1rm))}
      <div class="exmeta" style="margin-top:22px">
        <div class="exmeta__row"><span class="exmeta__l">Next session</span><span class="exmeta__v">${p.weight ? fmtN(p.weight) + " kg × " + p.reps : findEx(exId).reps}</span></div>
      </div>
      ${p.reason ? `<p class="coach">${p.reason}</p>` : ""}
      ${s.length ? `<div class="section"><div class="section__head"><span class="section__title">Every session</span><span class="section__aside">${s.length}</span></div>
        <div class="hist">${s.slice().reverse().map(x => `<div class="hist__row" style="cursor:default"><span class="hist__day">${DAY_SHORT[x.day] || fmtDate(x.date)}</span><span class="hist__meta">${fmtDate(x.date)} · ${x.sets.map(z => `${fmtN(z.weight)}×${z.reps}`).join(", ")}</span></div>`).join("")}</div>
      </div>` : ""}
    `;
    document.getElementById("pg-back").addEventListener("click", () => history.back());
  }

  // ---------- SESSION editor (edit / undo) ----------
  function saveEdit(key) {
    const se = store.sessions[key]; if (!se) return;
    Object.values(se.exercises).forEach(e => { e.completed = (e.sets || []).length > 0 && e.sets.every(s => s.done); });
    save(store);
  }
  function renderEditRows(box, key, exId, st) {
    box.innerHTML = "";
    st.sets.forEach((set, i) => {
      const row = document.createElement("div"); row.className = "setrow";
      row.innerHTML = `
        <span class="setrow__n">Set ${i + 1}</span>
        <span class="stepper"><button class="stepper__b" data-w="-2.5">&minus;</button><input class="stepper__f" inputmode="decimal" value="${set.weight}" data-f="weight"><span class="stepper__u">kg</span><button class="stepper__b" data-w="2.5">+</button></span>
        <span class="stepper"><button class="stepper__b" data-r="-1">&minus;</button><input class="stepper__f" inputmode="numeric" value="${set.reps}" data-f="reps"><span class="stepper__u">rep</span><button class="stepper__b" data-r="1">+</button></span>
        <button class="setrow__log ${set.done ? "" : "is-off"}">${set.done ? "Done" : "Off"}</button>`;
      const wIn = row.querySelector('[data-f="weight"]'), rIn = row.querySelector('[data-f="reps"]');
      row.querySelectorAll("[data-w]").forEach(b => b.addEventListener("click", () => { wIn.value = Math.max(0, (parseFloat(wIn.value) || 0) + parseFloat(b.dataset.w)); set.weight = wIn.value; saveEdit(key); }));
      row.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => { rIn.value = Math.max(0, (parseInt(rIn.value, 10) || 0) + parseInt(b.dataset.r, 10)); set.reps = String(rIn.value); saveEdit(key); }));
      wIn.addEventListener("input", () => { set.weight = wIn.value; saveEdit(key); });
      rIn.addEventListener("input", () => { set.reps = rIn.value; saveEdit(key); });
      row.querySelector(".setrow__log").addEventListener("click", () => { set.done = !set.done; saveEdit(key); renderEditRows(box, key, exId, st); });
      box.appendChild(row);
    });
  }
  function renderSessionEdit(key) {
    const se = store.sessions[key]; if (!se) { view = { name: "home" }; render(); return; }
    const prog = progFor(se.day) || { title: se.day, exercises: [] };
    const exIds = Object.keys(se.exercises || {}).filter(exId => (se.exercises[exId].sets || []).some(s => s.done));
    screen.innerHTML = `
      <button class="back" id="se-back">Back</button>
      <p class="exhead__idx">Edit session</p>
      <h1 class="exhead__name">${(prog.title || se.day).split(" — ")[0]}</h1>
      <p class="shead__sub">${fmtDate(se.date)}${se.completedAt ? " · complete" : " · in progress"}</p>
      <textarea class="note" id="se-note" placeholder="How did it go?">${esc(se.note)}</textarea>
      ${exIds.length ? exIds.map(exId => { const lib = EXERCISE_LIBRARY[exId] || { name: exId }; return `<div class="section"><p class="edit__ex">${lib.name}</p><div class="logger" data-se-ex="${exId}"></div></div>`; }).join("") : `<p class="muted" style="margin-top:20px">Nothing logged in this session.</p>`}
      <button class="btn btn--ghost btn--danger" id="se-delete" style="margin-top:30px">Delete this session</button>
    `;
    document.getElementById("se-back").addEventListener("click", () => history.back());
    const sn = document.getElementById("se-note"); if (sn) sn.addEventListener("input", () => { se.note = sn.value; save(store); });
    screen.querySelectorAll("[data-se-ex]").forEach(box => renderEditRows(box, key, box.dataset.seEx, se.exercises[box.dataset.seEx]));
    document.getElementById("se-delete").addEventListener("click", () => {
      if (confirm("Delete this whole session? This can't be undone.")) { delete store.sessions[key]; if (store.current === key) store.current = null; save(store); view = { name: "home" }; render(); }
    });
  }

  // ---------- ONBOARDING + SETTINGS ----------
  function renderOnboard() {
    view = { name: "onboard" }; setTabbar(null, true);
    screen.innerHTML = `
      <div class="finish">
        <img class="brandmark" src="icons/cairn-outline.png" alt="" />
        <p class="finish__k">Cairn</p>
        <h1 class="finish__h">Welcome.</h1>
        <p class="finish__sub">Six weeks, three days a week — you, Faisal and Yazan. The app is your coach: it picks your weights, watches your joints, and moves you up only when you've earned it. Log honest and it adapts.</p>
        <p class="finish__sub" style="margin-top:12px">Your rank isn't a lifetime score — it's your <b>current form</b>: your last eight weeks of training plus the weight you've dropped. Keep both moving to hold it. Stop, and it fades. Your peak stays on record.</p>
        <p class="finish__sub" style="margin-top:12px">Two tabs. <b>Home</b> is your journey — rank, bodyweight, every personal best. <b>Train</b> runs the session set by set, with the form video a tap away.</p>
        <div class="finish__actions"><button class="btn btn--solid" id="ob-go">Begin</button></div>
      </div>`;
    document.getElementById("ob-go").addEventListener("click", () => { store.onboarded = true; save(store); view = { name: "home" }; history.replaceState({ v: "home" }, ""); render(); });
  }
  function renderSettings() {
    const rp = store.restPref || "std";
    screen.innerHTML = `
      <button class="back" id="set-back">Back</button>
      <p class="exhead__idx">Settings</p>
      <h1 class="exhead__name">Settings</h1>
      <div class="section"><p class="section__title">Rest length</p>
        <div class="feel__opts" id="rest-pref" style="margin-top:12px">
          <button class="feel__opt ${rp === "short" ? "is-sel" : ""}" data-rp="short">Shorter</button>
          <button class="feel__opt ${rp === "std" ? "is-sel" : ""}" data-rp="std">Standard</button>
          <button class="feel__opt ${rp === "long" ? "is-sel" : ""}" data-rp="long">Longer</button>
        </div>
        <p class="feel__note">Scales every rest timer. Standard is Marcus's default.</p>
      </div>
      <div class="section"><p class="section__title">Training-day reminder</p>
        <button class="feel__opt ${store.remind ? "is-sel" : ""}" id="remind-toggle" style="width:auto;padding:11px 20px;margin-top:12px">${store.remind ? "On" : "Off"}</button>
        <p class="feel__note">iOS can't wake a web app in the background yet, so this pings you when you open the app on a training day. A true morning alert needs a server — on the roadmap.</p>
      </div>
      <div class="section"><p class="section__title">How Cairn works</p>
        <p class="feel__note" style="margin-top:10px;line-height:1.6">Your rank is your <b>current form</b> — your last eight weeks of training plus the weight you've dropped. Keep both moving to hold it; stop and it fades, but your peak stays on record. Each logged set is 10 points, a personal best 40, every kilo lost 100, and other movement — runs, sport, yoga, walks — 2 a minute. Strength is the only place personal bests live.</p>
      </div>
      <div class="section"><p class="section__title">Data</p>
        ${store.lastBackup ? `<p class="feel__note" style="margin-top:8px">Last backup · ${backupAgo(store.lastBackup)}</p>` : ""}
        <button class="btn btn--ghost" id="s-export" style="margin-top:12px">Back up data</button>
        <button class="btn btn--ghost" id="s-restore" style="margin-top:10px">Restore from a backup</button>
        <button class="btn btn--ghost btn--danger" id="s-reset" style="margin-top:10px">Reset everything</button>
      </div>`;
    document.getElementById("set-back").addEventListener("click", () => history.back());
    screen.querySelectorAll("#rest-pref [data-rp]").forEach(b => b.addEventListener("click", () => { store.restPref = b.dataset.rp; save(store); renderSettings(); }));
    document.getElementById("remind-toggle").addEventListener("click", async () => {
      if (!store.remind) { try { const p = await Notification.requestPermission(); store.remind = (p === "granted"); if (p !== "granted") alert("Notifications are off in your browser settings — turn them on there first."); } catch (e) { store.remind = false; } }
      else store.remind = false;
      save(store); renderSettings();
    });
    document.getElementById("s-export").addEventListener("click", exportData);
    document.getElementById("s-restore").addEventListener("click", () => go({ name: "restore", back: { name: "settings" } }));
    document.getElementById("s-reset").addEventListener("click", resetApp);
  }
  function trainedToday() { const t = new Date().toDateString(); return Object.values(store.sessions || {}).some(s => isDone(s) && new Date(s.date).toDateString() === t); }

  // ---------- EXERCISE detail ----------
  function renderExercise(idx) {
    const day = currentDay(); const prog = progFor(day); const ex = prog.exercises[idx];
    const { session } = getSession(store, day); const exId = effId(session, idx, ex); const lib = EXERCISE_LIBRARY[exId];
    const last = lastPerformance(store, exId);
    ensureSets(session, exId, ex.sets, last, ex);
    const st = session.exercises[exId];
    const flaggedJoint = session.feel === "joints" && session.joint && (JOINT_LOAD[session.joint] || []).includes(exId) ? session.joint : null;
    let jointAlt = null;
    if (flaggedJoint) { const usedElsewhere = (id) => prog.exercises.some((e, j) => j !== idx && effId(session, j, e) === id); const cands = (lib.swaps || []).filter(s => EXERCISE_LIBRARY[s] && !usedElsewhere(s)); jointAlt = cands.find(s => !(JOINT_LOAD[flaggedJoint] || []).includes(s)) || null; }

    screen.innerHTML = `
      <button class="back" id="ex-back">Back</button>
      <p class="exhead__idx">Exercise ${idx + 1} of ${prog.exercises.length}${exId !== ex.id ? " · swapped" : ""}</p>
      <h1 class="exhead__name">${lib.name}</h1>
      <p class="exhead__cue">${lib.cue}</p>
      <input class="setupnote" id="setup-note" placeholder="Setup notes — seat, pin, machine…" value="${esc(setupNote(exId))}">
      ${st.reason ? `<p class="coach">${st.reason}</p>` : ""}
      ${flaggedJoint ? (jointAlt ? `<div class="jointswap"><p class="coach" style="margin-top:0">Your ${flaggedJoint.toLowerCase()} is flagged. ${EXERCISE_LIBRARY[jointAlt].name} spares it today.</p><button class="btn btn--outline" id="joint-swap">Swap to ${EXERCISE_LIBRARY[jointAlt].name}</button></div>` : `<div class="jointswap"><p class="coach" style="margin-top:0">Your ${flaggedJoint.toLowerCase()} is flagged, and nothing here truly spares it. Light feeler only, stop if it bites — or skip it today.</p><button class="btn btn--outline" id="joint-skip">Skip today</button></div>`) : ""}

      <div class="demo" id="demo" data-vid="${lib.video}" data-name="${lib.name}">
        <img class="demo__poster" src="https://i.ytimg.com/vi/${lib.video}/hqdefault.jpg" alt="" onerror="this.style.display='none'">
        <div class="demo__play"><span class="demo__playlabel">Watch the form</span></div>
      </div>
      <p class="demo__cap">${lib.videoTitle || "Form demo"}</p>

      <div class="exmeta">
        <div class="exmeta__row"><span class="exmeta__l">Today</span><span class="exmeta__v">${schemeLine(ex, st)}${(!st.rxWeight && ex.id !== "bike_finisher") ? " · " + ex.target : ""}</span></div>
        <div class="exmeta__row"><span class="exmeta__l">Last time</span><span class="exmeta__v">${last ? last.map(x => `${fmtN(x.weight)}×${x.reps}`).join(", ") : "First time — log honest."}</span></div>
      </div>

      <div class="logger" id="logger"></div>
      <p class="prtext" id="ex-pr"></p>

      <button class="pglink" id="see-progress">See ${lib.name} progress</button>

      <div class="swaps"><p class="swaps__t">Machine taken? Swap</p><div class="swaps__list" id="swaps"></div></div>
    `;

    document.getElementById("ex-back").addEventListener("click", () => history.back());
    const sn = document.getElementById("setup-note"); if (sn) sn.addEventListener("input", () => setSetupNote(exId, sn.value.trim()));   // 4.10
    wireDemo(document.getElementById("demo"));
    renderLogger(document.getElementById("logger"), day, idx, exId, st, ex);
    renderSwaps(document.getElementById("swaps"), day, idx, exId, ex);
    document.getElementById("see-progress").addEventListener("click", () => go({ name: "progress", exId, back: { name: "exercise", idx } }));
    if (flaggedJoint && jointAlt) { const js = document.getElementById("joint-swap"); if (js) js.addEventListener("click", () => { session.swaps = session.swaps || {}; migrateSwap(session, exId, jointAlt); session.swaps[idx] = jointAlt; save(store); renderExercise(idx); }); }
    if (flaggedJoint && !jointAlt) { const jk = document.getElementById("joint-skip"); if (jk) jk.addEventListener("click", () => { const s2 = session.exercises[exId]; if (s2) { s2.completed = true; s2.skipped = true; } save(store); history.back(); }); }
  }

  function renderLogger(box, day, idx, exId, st, ex) {
    box.innerHTML = "";
    st.sets.forEach((set, i) => {
      const row = document.createElement("div");
      row.className = "setrow" + (set.done ? " is-done" : "");
      row.innerHTML = `
        <div class="setrow__top">
          <span class="setrow__n">Set ${i + 1}</span>
          <button class="setrow__log">${set.done ? "Done" : "Log"}</button>
        </div>
        <div class="setrow__ctrls">
          <span class="stepper">
            <button class="stepper__b" data-w="-2.5">&minus;</button>
            <span class="ul-fx" data-ulw><input class="stepper__f" inputmode="decimal" value="${set.weight}" data-f="weight"></span>
            <span class="stepper__u">kg</span>
            <button class="stepper__b" data-w="2.5">+</button>
          </span>
          <span class="stepper">
            <button class="stepper__b" data-r="-1">&minus;</button>
            <input class="stepper__f" inputmode="numeric" value="${set.reps}" data-f="reps">
            <span class="stepper__u">rep</span>
            <button class="stepper__b" data-r="1">+</button>
          </span>
        </div>`;
      const wIn = row.querySelector('[data-f="weight"]'), rIn = row.querySelector('[data-f="reps"]');
      row.querySelectorAll("[data-w]").forEach(b => b.addEventListener("click", () => { wIn.value = Math.max(0, (parseFloat(wIn.value) || 0) + parseFloat(b.dataset.w)); set.weight = wIn.value; persist(day); }));
      row.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => { rIn.value = Math.max(0, (parseInt(rIn.value, 10) || 0) + parseInt(b.dataset.r, 10)); set.reps = String(rIn.value); persist(day); }));
      wIn.addEventListener("input", () => { set.weight = wIn.value; persist(day); });
      rIn.addEventListener("input", () => { set.reps = rIn.value; persist(day); });
      row.querySelector(".setrow__log").addEventListener("click", () => {
        set.done = !set.done; persist(day);
        if (set.done) {
          const pr = checkPR(exId, set);
          const ulw = row.querySelector("[data-ulw]"); ulw.classList.remove("is-on"); void ulw.offsetWidth; ulw.classList.add("is-on");
          buzz(); document.getElementById("ex-pr").textContent = prText(pr); const rs = restFor(exId); if (rs > 0) startRest(null, "", rs);
        }
        renderLogger(box, day, idx, exId, st, ex);
      });
      box.appendChild(row);
    });
  }

  function renderSwaps(box, day, idx, exId, ex) {
    const lib = EXERCISE_LIBRARY[exId]; const origId = ex.id;
    const prog = progFor(day), { session } = getSession(store, day);
    // 1.2 — exclude ids another slot already resolves to, so a swap can't merge two slots
    const usedElsewhere = (id) => prog.exercises.some((e, j) => j !== idx && effId(session, j, e) === id);
    let cands = (lib.swaps || []).filter(id => EXERCISE_LIBRARY[id] && id !== exId && !usedElsewhere(id));
    if (exId !== origId && !usedElsewhere(origId)) cands.unshift(origId);
    if (!cands.length) { box.parentElement.hidden = true; return; }
    box.innerHTML = "";
    cands.forEach(id => {
      const b = document.createElement("button");
      b.className = "swap" + (id === origId && exId !== origId ? " is-revert" : "");
      b.textContent = (id === origId && exId !== origId ? "Revert to " : "") + EXERCISE_LIBRARY[id].name;
      b.addEventListener("click", () => {
        const { session } = getSession(store, day);
        session.swaps = session.swaps || {};
        migrateSwap(session, exId, id);
        if (id === origId) delete session.swaps[idx]; else session.swaps[idx] = id;
        save(store); renderExercise(idx);
      });
      box.appendChild(b);
    });
  }

  // 4.1 — keep the screen awake during a guided session; iOS releases the lock on background.
  let wakeLock = null;
  async function acquireWake() { try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) {} }
  function releaseWake() { try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} }
  // 4.10 — per-exercise setup notes (seat, pin, machine), persisted by exercise id
  function setupNote(exId) { return (store.setupNotes && store.setupNotes[exId]) || ""; }
  function setSetupNote(exId, v) { store.setupNotes = store.setupNotes || {}; if (v) store.setupNotes[exId] = v; else delete store.setupNotes[exId]; save(store); }

  // ---------- GUIDED runner ----------
  function startGuided() {
    const day = currentDay(); const prog = progFor(day); const { session } = getSession(store, day);
    if (!session.startedAt) { session.startedAt = new Date().toISOString(); save(store); }
    primeAudio(); acquireWake();
    // scan for the first incomplete set + whether anything's been logged yet
    let exIdx = 0, setIdx = 0, anyDone = false, found = false;
    for (let i = 0; i < prog.exercises.length; i++) {
      const exId = effId(session, i, prog.exercises[i]); ensureSets(session, exId, prog.exercises[i].sets, lastPerformance(store, exId), prog.exercises[i]);
      const st = session.exercises[exId];
      if (st.sets.some(s => s.done)) anyDone = true;
      const u = st.sets.findIndex(s => !s.done);
      if (u !== -1 && !found) { exIdx = i; setIdx = u; found = true; }
    }
    if (!found) return finishSession();
    // fresh session opens on the warm-up + preview; resuming jumps straight to the next set
    guided = { day, exIdx, setIdx, phase: anyDone ? "set" : "warmup", state: "set" };
    go({ name: "guided" });
  }

  function renderGuidedPick() {
    const { day } = guided; const prog = progFor(day); const { session } = getSession(store, day);
    const rows = prog.exercises.map((e, i) => {
      const exId = effId(session, i, e); const lib = EXERCISE_LIBRARY[exId] || {};
      const st = session.exercises[exId]; const doneCount = st ? st.sets.filter(s => s.done).length : 0;
      const complete = doneCount >= e.sets, ssName = e.ss === "C" ? "Finisher" : "Superset " + e.ss, cur = i === guided.exIdx;
      return `<button class="nh-logrow" data-jump="${i}"${complete ? ' disabled style="opacity:.4"' : ""}><div><div class="lt">${lib.name}${cur ? " · current" : ""}</div><div class="ls">${ssName} · ${complete ? "done" : doneCount + " of " + e.sets + " sets"}</div></div><span class="nh-go">${complete ? "" : "›"}</span></button>`;
    }).join("");
    screen.innerHTML = `
      <div class="guided">
        <div class="gbar"><button class="gbar__x" id="gp-back">Back</button></div>
        <h1 class="gname" style="margin-bottom:4px">Do any exercise</h1>
        <p class="gcue" style="opacity:.75">Machine busy? Pick whatever's free — order doesn't matter, it all still counts.</p>
        <div style="margin-top:18px">${rows}</div>
        <div style="height:40px"></div>
      </div>`;
    screen.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => {
      const i = +b.dataset.jump, e = prog.exercises[i], exId = effId(session, i, e);
      ensureSets(session, exId, e.sets, lastPerformance(store, exId), e);
      const st = session.exercises[exId]; let u = st.sets.findIndex(s => !s.done); if (u === -1) u = 0;
      guided.exIdx = i; guided.setIdx = u; guided.phase = "set"; renderGuided();
    }));
    document.getElementById("gp-back").addEventListener("click", () => renderGuided());
  }

  function switchGuidedDay(newDay) {
    if (!guided || newDay === guided.day) return;
    // resolve the OLD session by its carried key (1.3) so we drop the right one across midnight
    const oldKey = (store.current && store.sessions[store.current] && store.sessions[store.current].day === guided.day) ? store.current : dateKey(guided.day);
    const oldSess = store.sessions[oldKey];
    if (oldSess && !isDone(oldSess)) { delete store.sessions[oldKey]; if (store.current === oldKey) store.current = null; }  // drop the empty session so it doesn't orphan
    dayPick = newDay;
    const { key } = getSession(store, newDay);
    store.current = key;
    guided.day = newDay; guided.exIdx = 0; guided.setIdx = 0; guided.phase = "warmup";
    save(store);
    renderGuidedWarmup();
  }

  function renderGuidedWarmup() {
    const { day } = guided; const prog = progFor(day); const { session } = getSession(store, day);
    const exs = prog.exercises, groups = [];
    exs.forEach((e, i) => { const nm = (EXERCISE_LIBRARY[effId(session, i, e)] || {}).name || ""; const g = groups.find(x => x.ss === e.ss); if (g) g.names.push(nm); else groups.push({ ss: e.ss, names: [nm] }); });
    const pairList = groups.map(g => `<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 2px;border-bottom:1px solid rgba(255,255,255,.08)"><span style="opacity:.5;font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap">${g.ss === "C" ? "Finisher" : "Superset " + g.ss}</span><span style="text-align:right">${g.names.join(" + ")}</span></div>`).join("");
    screen.innerHTML = `
      <div class="guided">
        <div class="gbar"><button class="gbar__x" id="gw-exit">Exit</button></div>
        <p class="kicker">${phaseName()} · ${progWeekLabel()}</p>
        <h1 class="gname" style="margin-bottom:4px">${prog.title.split(" — ")[0]}</h1>
        <p class="gcue" style="opacity:.75">~45 min · ${exs.length} moves in ${groups.length} supersets</p>
        <div class="feel__opts" style="margin-top:14px">${ROTATION.map(dk => `<button class="feel__opt ${dk === guided.day ? "is-sel" : ""}" data-swday="${dk}">${DAY_SHORT[dk]}</button>`).join("")}</div>

        <p class="section__title" style="margin-top:24px">How does it feel?</p>
        <div class="feel__opts" id="feel-opts">${FEEL_OPTIONS.map(o => `<button class="feel__opt ${session.feel === o.id ? "is-sel" : ""}" data-feel="${o.id}">${o.label}</button>`).join("")}</div>
        <p class="feel__note">${(FEEL_OPTIONS.find(o => o.id === session.feel) || {}).note || ""}</p>
        <div class="joints" id="joints" ${session.feel === "joints" ? "" : "hidden"}>${JOINTS.map(j => `<button class="joints__b ${session.joint === j ? "is-sel" : ""}" data-joint="${j}">${j}</button>`).join("")}</div>

        <div class="warm" style="margin-top:22px"><p class="warm__t">Warm-up first</p>${warmupFor(day, session)}</div>

        <p class="section__title" style="margin-top:22px">Your session · set these up</p>
        <div>${pairList}</div>

        <div class="section" style="margin-top:22px"><p class="section__title">Who's in</p>
          <div class="crew">${CREW.map(c => `<button class="crew__chip ${session.crew[c] ? "is-in" : ""}" data-crew="${c}">${c}<small>${session.crew[c] ? "In" : "Out"}</small></button>`).join("")}</div>
        </div>

        <div style="height:100px"></div>
        <div class="trainbar"><button class="btn btn--solid" id="gw-start">Warm-up done — start lifting</button></div>
      </div>`;
    screen.querySelectorAll("[data-feel]").forEach(b => b.addEventListener("click", () => {
      session.feel = session.feel === b.dataset.feel ? null : b.dataset.feel;
      if (session.feel !== "joints") session.joint = null;
      Object.keys(session.exercises).forEach(exId => { const e = session.exercises[exId]; if (!(e.sets || []).some(s => s.done)) delete session.exercises[exId]; });
      save(store); renderGuidedWarmup();
    }));
    screen.querySelectorAll("[data-joint]").forEach(b => b.addEventListener("click", () => { session.joint = session.joint === b.dataset.joint ? null : b.dataset.joint; save(store); renderGuidedWarmup(); }));
    screen.querySelectorAll("[data-crew]").forEach(b => b.addEventListener("click", () => { session.crew[b.dataset.crew] = !session.crew[b.dataset.crew]; save(store); renderGuidedWarmup(); }));
    screen.querySelectorAll("[data-swday]").forEach(b => b.addEventListener("click", () => switchGuidedDay(b.dataset.swday)));
    document.getElementById("gw-start").addEventListener("click", () => { guided.phase = "set"; guided.exIdx = 0; guided.setIdx = 0; renderGuided(); });
    document.getElementById("gw-exit").addEventListener("click", () => exitGuided(true));
  }

  function renderGuided() {
    if (!guided) { view = { name: "train" }; renderTrain(); return; }
    if (guided.phase === "warmup") return renderGuidedWarmup();
    const { day } = guided; const prog = progFor(day); const { session } = getSession(store, day);
    if (guided.exIdx >= prog.exercises.length) return finishSession();
    const ex = prog.exercises[guided.exIdx]; const exId = effId(session, guided.exIdx, ex); const lib = EXERCISE_LIBRARY[exId];
    ensureSets(session, exId, ex.sets, lastPerformance(store, exId), ex);
    const st = session.exercises[exId];
    while (guided.setIdx < st.sets.length && st.sets[guided.setIdx].done) guided.setIdx++;
    if (guided.setIdx >= st.sets.length) { guided.exIdx++; guided.setIdx = 0; return renderGuided(); }

    const set = st.sets[guided.setIdx];
    const feeler = guided.setIdx === 0;
    const total = prog.exercises.length;
    const _gpi = ssPartnerIdx(prog.exercises, guided.exIdx);
    const _gpn = _gpi !== -1 ? (EXERCISE_LIBRARY[effId(session, _gpi, prog.exercises[_gpi])] || {}).name : "";
    const ssNote = _gpn ? `<p class="gcue" style="opacity:.7">Paired with ${_gpn} — the app alternates you two; one rest after both.</p>` : "";
    let _totSets = 0, _doneSets = 0;
    prog.exercises.forEach((e, idx) => { const id = effId(session, idx, e); const s = session.exercises[id]; _totSets += e.sets; if (s && s.sets) _doneSets += s.sets.filter(x => x.done).length; });
    const frac = _totSets ? _doneSets / _totSets : 0;
    const repLabel = ex.id === "bike_finisher" ? ex.reps : (/each side|paces/i.test(ex.reps) ? ex.reps : (st.rxReps || ex.reps) + " reps");

    screen.innerHTML = `
      <div class="guided">
        <div class="gbar"><button class="gbar__x" id="g-exit">Exit</button><span class="gbar__track"><span class="gbar__fill" style="width:${(frac * 100).toFixed(0)}%"></span></span></div>
        <p class="gstep">${_gpi !== -1 ? (ex.ss === "C" ? "Finisher" : "Superset " + ex.ss) + " · round " + (guided.setIdx + 1) + " of " + ex.sets : "Exercise " + (guided.exIdx + 1) + " of " + total}</p>
        <h1 class="gname">${lib.name}</h1>
        ${setupNote(exId) ? `<p class="gsetup">${esc(setupNote(exId))}</p>` : ""}
        <p class="gcue">${lib.cue}</p>
        ${ssNote}
        <div class="gdemo" id="g-demo" hidden></div>
        <div class="gset">
          ${feeler ? `<p class="gfeeler">Feeler set — ramp up, lighter</p>` : ""}
          <p class="gset__lbl">Set ${guided.setIdx + 1} of ${ex.sets} · target ${repLabel}</p>
          ${!feeler && st.reason ? `<p class="coach" style="text-align:center;max-width:32ch;margin:0 auto 14px">${st.reason}</p>` : ""}
          <div class="ginputs">
            <div class="ginput"><div class="ginput__row"><button class="ginput__b" data-gw="-2.5">&minus;</button><span class="ul-fx" id="g-ulw"><input class="ginput__f" id="g-weight" inputmode="decimal" value="${set.weight}"></span><button class="ginput__b" data-gw="2.5">+</button></div><span class="ginput__u">kg</span></div>
            <div class="ginput"><div class="ginput__row"><button class="ginput__b" data-gr="-1">&minus;</button><input class="ginput__f" id="g-reps" inputmode="numeric" value="${set.reps}"><button class="ginput__b" data-gr="1">+</button></div><span class="ginput__u">reps</span></div>
          </div>
          <p class="gprtext" id="g-pr"></p>
          ${!feeler ? `<div class="grpe" id="g-rpe"><button class="grpe__b ${set.rpe === "easy" ? "is-sel" : ""}" data-rpe="easy">Had more</button><button class="grpe__b ${set.rpe === "ontarget" ? "is-sel" : ""}" data-rpe="ontarget">On it</button><button class="grpe__b ${set.rpe === "grind" ? "is-sel" : ""}" data-rpe="grind">Grinding</button></div>` : ""}
          <button class="btn btn--solid glog" id="g-log">Log set</button>
          <div class="gquick"><button class="gquick__b" id="g-demo-btn">Watch how</button><button class="gquick__b" id="g-jump">Do another</button><button class="gquick__b" id="g-skip">Skip</button><button class="gquick__b" id="g-swap">Swap</button></div>
        </div>
      </div>`;

    const wIn = document.getElementById("g-weight"), rIn = document.getElementById("g-reps");
    // 4.4 — persist guided inputs to the set before "Log set", so "Do another"/"Swap" re-renders don't lose them
    document.querySelectorAll("[data-gw]").forEach(b => b.addEventListener("click", () => { wIn.value = Math.max(0, (parseFloat(wIn.value) || 0) + parseFloat(b.dataset.gw)); set.weight = wIn.value; persist(day); }));
    document.querySelectorAll("[data-gr]").forEach(b => b.addEventListener("click", () => { rIn.value = Math.max(0, (parseInt(rIn.value, 10) || 0) + parseInt(b.dataset.gr, 10)); set.reps = String(rIn.value); persist(day); }));
    wIn.addEventListener("input", () => { set.weight = wIn.value; persist(day); });
    rIn.addEventListener("input", () => { set.reps = rIn.value; persist(day); });
    document.getElementById("g-log").addEventListener("click", () => {
      set.weight = wIn.value; set.reps = rIn.value; set.done = true;
      st.completed = st.sets.every(s => s.done);
      persist(day);
      const pr = checkPR(exId, set); const prLine = prText(pr);   // 4.2 — carry the PR line into the rest overlay
      const ulw = document.getElementById("g-ulw"); ulw.classList.remove("is-on"); void ulw.offsetWidth; ulw.classList.add("is-on");
      buzz(); document.getElementById("g-pr").textContent = prLine;
      const round = guided.setIdx, partnerIdx = ssPartnerIdx(prog.exercises, guided.exIdx);
      const nameAt = (idx) => { const e = prog.exercises[idx]; const l = e ? EXERCISE_LIBRARY[effId(session, idx, e)] : null; return l ? l.name : ""; };
      let nextText = "", rs = restFor(exId), restLbl = "Rest";
      if (partnerIdx === -1) {
        // solo exercise — finish all its sets, then the next block
        const lastSet = round >= ex.sets - 1, lastEx = guided.exIdx >= total - 1;
        if (lastSet && lastEx) { setTimeout(finishSession, 700); return; }
        guided.setIdx = lastSet ? 0 : round + 1; if (lastSet) guided.exIdx++;
        nextText = lastSet ? (nameAt(guided.exIdx) ? "Next: " + nameAt(guided.exIdx) : "Last set") : "Next: set " + (guided.setIdx + 1);
      } else if (partnerIdx > guided.exIdx) {
        // first of the pair done → short "switch stations" pause (display + countdown + skip), then the partner (same round)
        guided.exIdx = partnerIdx; nextText = "Superset · switch to " + nameAt(partnerIdx); rs = 20; restLbl = "Switch";
      } else {
        // second of the pair done → full rest, then next round or next block
        const firstIdx = partnerIdx;
        if (round + 1 < ex.sets) { guided.exIdx = firstIdx; guided.setIdx = round + 1; nextText = "Round " + (round + 2) + " · " + nameAt(firstIdx); }
        else { const nextIdx = Math.max(guided.exIdx, firstIdx) + 1; if (nextIdx >= total) { setTimeout(finishSession, 700); return; } guided.exIdx = nextIdx; guided.setIdx = 0; nextText = "Next: " + nameAt(nextIdx); }
      }
      if (rs > 0) startRest(() => renderGuided(), nextText, rs, restLbl, prLine); else renderGuided();
    });
    document.getElementById("g-exit").addEventListener("click", () => exitGuided(true));
    document.getElementById("g-skip").addEventListener("click", () => { if (confirm("Skip this exercise?")) { guided.exIdx++; guided.setIdx = 0; renderGuided(); } });
    document.getElementById("g-swap").addEventListener("click", () => { const i = guided.exIdx; exitGuided(false); go({ name: "exercise", idx: i }); });
    document.getElementById("g-jump").addEventListener("click", () => renderGuidedPick());
    screen.querySelectorAll("#g-rpe .grpe__b").forEach(b => b.addEventListener("click", () => { set.rpe = set.rpe === b.dataset.rpe ? null : b.dataset.rpe; save(store); document.querySelectorAll("#g-rpe .grpe__b").forEach(x => x.classList.toggle("is-sel", x.dataset.rpe === set.rpe)); }));
    document.getElementById("g-demo-btn").addEventListener("click", () => {
      const gd = document.getElementById("g-demo");
      if (gd.hidden) { gd.innerHTML = !navigator.onLine ? `<p class="gcue" style="text-align:center;margin-top:12px;opacity:.7">Video needs a connection.</p>` : (lib.video ? `<div class="demo" style="margin-top:12px"><iframe src="https://www.youtube.com/embed/${lib.video}?rel=0&modestbranding=1&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : `<a class="btn btn--ghost" href="https://www.youtube.com/results?search_query=${encodeURIComponent(lib.name + " exercise form")}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-top:12px">Search YouTube for "${lib.name}"</a>`); gd.hidden = false; }
      else { gd.innerHTML = ""; gd.hidden = true; }
    });
  }

  function exitGuided(confirmFirst) {
    if (confirmFirst && isDone(getSession(store, guided.day).session) && !confirm("Exit the session? Your logs are saved.")) return;
    stopRest(); releaseWake(); guided = null; view = { name: "train" }; render();
  }

  // ---------- FINISH ----------
  function finishSession() {
    const day = guided ? guided.day : currentDay(); const { key, session } = getSession(store, day);
    const before = pointsWithout(key);   // score as if this session hadn't happened → the finish meter shows its real gain
    session.completedAt = new Date().toISOString();
    const summit = programWeek() >= 6 && !store.summitShown;   // 1.7b — the week-6 milestone, shown once
    if (summit) store.summitShown = true;
    save(store);
    mirrorBackup();   // 2.3a — second on-device copy after each finished session
    stopRest(); releaseWake(); guided = null;
    view = { name: "finish", before, day, summit }; render();
  }
  function pointsWithout(key) {
    const clone = Object.assign({}, store, { sessions: Object.assign({}, store.sessions) });
    delete clone.sessions[key];
    return derive(clone).points;
  }
  function updateBestRank(d) { if (d.tierIdx > (store.bestRankIdx || 0)) { store.bestRankIdx = d.tierIdx; save(store); } }

  function renderFinish() {
    const day = view.day; const prog = progFor(day) || { title: "Session" };
    const d = derive(store); updateBestRank(d);
    const { session } = getSession(store, day);
    const sets = doneSets(session).length;
    const vol = doneSets(session).reduce((a, s) => a + (+s.weight || 0) * (+s.reps || 0), 0);
    const beforeFrac = (() => { let ti = 0; TIERS.forEach((t, i) => { if (view.before >= t.min) ti = i; }); const c = TIERS[ti], n = TIERS[ti + 1]; return n ? Math.max(0, Math.min(1, (view.before - c.min) / (n.min - c.min))) : 1; })();
    const inCount = session.crew ? CREW.filter(c => session.crew[c]).length : 0;
    const crewLine = inCount === 2 ? "All three of you showed up." : inCount === 1 ? `${CREW.find(c => session.crew[c])} showed up with you.` : "Solo today — still counts.";
    const fwd = d.next ? `${Math.max(0, d.next.min - d.points)} points to ${d.next.n}` : "Apex reached";
    const weekLine = d.thisWeek >= 3 ? "Full week — three of three." : `${d.thisWeek} of 3 this week.`;
    const nextFocus = DAY_SHORT[ROTATION[(ROTATION.indexOf(day) + 1) % ROTATION.length]] || "your next session";
    // 1.7b — the week-6 summit: a quiet, one-time milestone reckoning in the same editorial voice
    const summitBlock = view.summit ? `
        <p class="finish__sub" style="margin-top:14px">Six weeks. You kept showing up. Here's the ground you covered.</p>
        <div class="finish__stat" style="margin-top:10px">
          <div><div class="v">${fmtVol(d.totalVol)}</div><div class="u">Total kg moved</div></div>
          <div><div class="v">${fmtN(d.kgLost)}</div><div class="u">Kg of you, gone</div></div>
        </div>
        <div class="finish__stat" style="margin-top:6px">
          <div><div class="v">${d.prCount}</div><div class="u">Personal bests</div></div>
          <div><div class="v">${d.cur.n}</div><div class="u">Rank reached</div></div>
        </div>
        <p class="finish__sub" style="margin-top:12px">Phase 1 is behind you. The climb keeps going — same rhythm, a deload every fourth week — until Marcus writes Phase 2.</p>` : "";

    screen.innerHTML = `
      <div class="finish">
        <img class="brandmark" src="icons/cairn-outline.png" alt="" />
        <p class="finish__k">${prog.title.split(" — ")[0]}</p>
        <h1 class="finish__h">${view.summit ? "Phase 1, done." : "Done."}</h1>
        <p class="finish__sub">${sets} sets logged. ${crewLine}</p>
        <p class="finish__sub" style="margin-top:6px">${weekLine} Next up, ${nextFocus} — ${fwd}.</p>
        ${summitBlock}
        <div class="finish__stat">
          <div><div class="v">${fmtVol(vol)}</div><div class="u">Kg this session</div></div>
          <div><div class="v">${d.cur.n}</div><div class="u">Rank</div></div>
        </div>
        <div class="finish__meter">
          <div class="rank__row"><span class="rank__pts">${d.points} points</span><span class="rank__next">${d.next ? `<b>${Math.max(0, d.next.min - d.points)} to ${d.next.n}</b>` : "Apex"}</span></div>
          <div class="meter"><span class="meter__fill" id="f-meter"></span></div>
        </div>
        <textarea class="note" id="finish-note" placeholder="How did it go? One line for Marcus.">${esc(session.note)}</textarea>
        <div class="finish__actions"><button class="btn btn--solid" id="f-home">Back to home</button></div>
      </div>`;
    const fn = document.getElementById("finish-note"); if (fn) fn.addEventListener("input", () => { session.note = fn.value; save(store); });
    const m = document.getElementById("f-meter");
    m.style.width = (beforeFrac * 100).toFixed(1) + "%";
    requestAnimationFrame(() => setTimeout(() => { m.classList.add("is-glow"); m.style.width = (d.frac * 100).toFixed(1) + "%"; setTimeout(() => m.classList.remove("is-glow"), 800); }, 350));
    document.getElementById("f-home").addEventListener("click", () => { store.current = null; save(store); view = { name: "home" }; history.pushState({ v: "home" }, ""); render(); });
  }

  // ---------- helpers ----------
  function effId(session, idx, ex) { return (session.swaps && session.swaps[idx]) || ex.id; }
  // 1.1 — swap state migration: DONE sets stay under their original exercise id so PRs/volume
  // aren't mis-attributed; the new exercise starts fresh so ensureSets re-prescribes for it.
  function migrateSwap(session, fromId, toId) {
    if (fromId === toId) return;
    const cur = session.exercises[fromId];
    if (cur) {
      const done = (cur.sets || []).filter(s => s.done);
      if (done.length) { cur.sets = done; cur.completed = false; }   // keep the logged sets under fromId
      else delete session.exercises[fromId];                          // nothing logged → drop the empty slot
    }
    if (!session.exercises[toId]) session.exercises[toId] = { completed: false, sets: [] };  // fresh; ensureSets fills
  }
  // Scheme text for a card/detail — cardio shows its time, per-side moves keep "each side", lifts show reps × kg.
  function schemeLine(ex, st) {
    if (ex.id === "bike_finisher") return ex.reps;
    const reps = /each side|paces/i.test(ex.reps) ? ex.reps : (st.rxReps || ex.reps);
    return `${ex.sets} × ${reps}${st.rxWeight ? " · " + st.rxWeight + " kg" : ""}`;
  }
  // ---- progression engine (Marcus's brain) ----
  // 1.7a — no longer capped at 6; after week 6 the cycle rolls on (deload every 4th week).
  function programWeek() { if (!store.started) return 1; const d = Math.floor((Date.now() - new Date(store.started).getTime()) / 86400000); return Math.max(1, Math.floor(d / 7) + 1); }
  function isDeloadWeek(w) { return (+w > 0) && (+w % 4 === 0); }   // weeks 4, 8, 12 … tendons catch up
  function phaseName() { return programWeek() <= 6 ? "Phase 1" : "Phase 1+"; }
  function progWeekLabel() { const w = programWeek(); return w <= 6 ? `Week ${w} of 6` : `Week ${w}`; }
  function startWeight(exId, ex) { return (typeof STARTING_WEIGHTS !== "undefined" && STARTING_WEIGHTS[exId]) || parseTargetKg(ex.target) || 0; }
  function stepFor(exId) { return STEP[exId] != null ? STEP[exId] : 2.5; }
  function exHistory(exId) {
    const cur = store.current, out = [];
    Object.entries(store.sessions || {}).forEach(([k, se]) => {
      if (k === cur) return; const e = se.exercises && se.exercises[exId]; if (!e || !e.sets) return;
      const working = e.sets.filter((s, i) => i >= 1 && s.done);   // set 0 is the feeler, excluded
      if (!working.length) return;
      out.push({ date: se.date, feel: se.feel, week: se.week, reps: working.map(s => +s.reps || 0), weight: Math.max(...working.map(s => +s.weight || 0)), grind: working.some(s => s.rpe === "grind") });
    });
    out.sort((a, b) => new Date(a.date) - new Date(b.date));
    return out;
  }
  // Deterministic. Evaluation order top-to-bottom, first match wins.
  function prescribe(exId, ex, session) {
    const T = parseInt((ex.reps.match(/^\d+/) || ["10"])[0], 10) || 10, Tmin = Math.max(1, T - 2);
    const step = stepFor(exId), feel = session.feel, week = programWeek();
    const hist = exHistory(exId), last = hist[hist.length - 1], R = REASONS;
    const base = last ? last.weight : startWeight(exId, ex);
    // most recent history entry before `last` that satisfies pred (walk backwards)
    const priorEntry = (pred) => { for (let i = hist.length - 2; i >= 0; i--) if (pred(hist[i])) return hist[i]; return null; };
    if (feel === "joints") return { weight: round25(base * 0.8), reps: Tmin, reason: R.joints, feelerPct: 0.5 };
    // 1.5 — coming OFF a joints day: resume the pre-joints weight, don't stack another 20% cut
    if (last && last.feel === "joints") {
      const resume = priorEntry(h => h.feel !== "joints");
      return { weight: round25(resume ? resume.weight : base), reps: Tmin, reason: R.resume_joints, feelerPct: 0.6 };
    }
    if (isDeloadWeek(week)) return { weight: round25(base * 0.9), reps: Tmin, reason: R.deload_week, feelerPct: 0.6 };
    // 1.6 — coming OFF a deload week: resume the pre-deload working weight, don't re-earn it
    if (last && isDeloadWeek(last.week)) {
      const resume = priorEntry(h => !isDeloadWeek(h.week));
      return { weight: round25(resume ? resume.weight : base), reps: T, reason: R.resume_deload, feelerPct: 0.6 };
    }
    if (!last) return { weight: startWeight(exId, ex), reps: Tmin, reason: R.first, feelerPct: 0.6 };
    const w = last.weight, reps = last.reps, allAtT = reps.every(r => r >= T), minRep = Math.min(...reps);
    if (minRep < Tmin) return { weight: round25(w - step), reps: Tmin, reason: R.deload_miss, feelerPct: 0.6 };
    const prev = hist[hist.length - 2];
    if (last.feel === "mediocre" && prev && prev.feel === "mediocre" && prev.weight === w) return { weight: round25(w - step), reps: Tmin, reason: R.deload_mediocre, feelerPct: 0.6 };
    if (feel === "mediocre" || last.feel === "mediocre") return { weight: w, reps: T, reason: R.hold_mediocre, feelerPct: 0.6 };
    if (!allAtT) return { weight: w, reps: T, reason: R.hold_reps, feelerPct: 0.6 };
    const consolidated = hist.filter(h => h.weight === w && h.reps.every(r => r >= T)).length >= 2;
    if (!consolidated) return { weight: w, reps: T, reason: R.consolidate, feelerPct: 0.6 };
    if (last.grind) return { weight: w, reps: T, reason: R.hold_grind, feelerPct: 0.6 };
    return { weight: round25(w + step), reps: Tmin, reason: R.bump_load, feelerPct: 0.6 };
  }

  function ensureSets(session, exId, n, last, ex) {
    const p = prescribe(exId, ex, session);
    const workW = p.weight ? String(round25(p.weight)) : "";
    const feelW = p.weight ? String(round25(p.weight * (p.feelerPct || 0.6))) : "";
    const workR = String(p.reps || (ex.reps.match(/^\d+/) || [""])[0] || "");
    const feelR = String(Math.min(8, Math.max(1, Math.round((parseInt(workR, 10) || 10) / 2))));
    let st = session.exercises[exId];
    if (!st || !st.sets || st.sets.length !== n) {
      st = st || { completed: false };
      st.sets = Array.from({ length: n }, (_, i) => ({
        weight: st.sets && st.sets[i] ? st.sets[i].weight : (i === 0 ? feelW : workW),
        reps: st.sets && st.sets[i] ? st.sets[i].reps : (i === 0 ? feelR : workR),
        done: st.sets && st.sets[i] ? st.sets[i].done : false
      }));
      session.exercises[exId] = st;
    }
    // backfill empty un-logged fields
    st.sets.forEach((s, i) => {
      if (!s.done && (s.weight === "" || s.weight == null)) { const v = i === 0 ? feelW : workW; if (v) s.weight = v; }
      if (!s.done && (s.reps === "" || s.reps == null)) { const v = i === 0 ? feelR : workR; if (v) s.reps = v; }
    });
    st.reason = p.reason; st.rxWeight = workW; st.rxReps = workR;
    save(store);
    return st;
  }
  function parseTargetKg(t) { const m = (t || "").match(/(\d+(?:\.\d+)?)\s*kg/i); return m ? parseFloat(m[1]) : 0; }
  function round25(n) { return Math.max(0, Math.round((+n || 0) / 2.5) * 2.5); }
  function checkPR(exId, set) {
    // "first" = first-ever log of this exercise; a "was W×R" string = beat a prior best; null = no PR
    const w = +set.weight || 0, r = +set.reps || 0; if (w <= 0) return null;
    const prior = priorBest(exId, set);
    if (!prior) return "first";
    const e = epley(w, r);
    if (e > prior.e + 0.01) return `${fmtN(prior.weight)}×${prior.reps}`;
    return null;
  }
  function prText(pr) { return pr === "first" ? "First log" : pr ? "New best · was " + pr : ""; }
  function priorBest(exId, current) {
    const all = Object.values(store.sessions || {}).filter(isDone).sort((a, b) => new Date(a.date) - new Date(b.date));
    let best = null;
    for (const se of all) {
      const e = se.exercises[exId]; if (!e) continue;
      // 4.5 — exclude set index 0 (the feeler), mirroring exHistory's i>=1, so a working set doesn't "beat" the same-session feeler
      (e.sets || []).forEach((st, i) => { if (i === 0 || st === current || !st.done) return; const w = +st.weight || 0, r = +st.reps || 0; if (w <= 0) return; const ee = epley(w, r); if (!best || ee > best.e) best = { e: ee, weight: w, reps: r }; });
    }
    return best;
  }
  function persist(day) {
    const { key, session } = getSession(store, day);
    const anyDone = Object.values(session.exercises).some(e => (e.sets || []).some(s => s.done));
    if (anyDone && !store.current) store.current = key;                    // claim as the live session once real data exists
    if (anyDone && !store.started) store.started = new Date().toISOString();
    if (anyDone && !session.startedAt) session.startedAt = new Date().toISOString();  // stamp actual start → duration
    Object.values(session.exercises).forEach(e => { e.completed = (e.sets || []).length > 0 && e.sets.every(s => s.done); });
    save(store);
  }

  function wireDemo(box) {
    if (!box) return;
    // Batch 5 a11y — clickable div gets button semantics + keyboard operation
    box.setAttribute("role", "button"); if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "0");
    if (!box.getAttribute("aria-label")) box.setAttribute("aria-label", "Play form video");
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); box.click(); } });
    box.addEventListener("click", function once() {
      if (!navigator.onLine) { const pl = box.querySelector(".demo__playlabel"); if (pl) pl.textContent = "Video needs a connection"; return; }   // 4.8 — don't inject a dead iframe offline
      const id = box.dataset.vid;
      if (!id) { window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent((box.dataset.name || "") + " exercise form"), "_blank", "noopener"); return; }
      box.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      box.removeEventListener("click", once);
    });
  }

  // ---------- rest timer (Date.now anchored, survives backgrounding) ----------
  let restInt = null, restEnd = 0, restRemain = REST_SECONDS, restCb = null;
  const restEl = document.getElementById("rest"), restTime = document.getElementById("rest-time"), restNext = document.getElementById("rest-next"), restLabel = document.getElementById("rest-label"), restPr = document.getElementById("rest-pr");
  function startRest(cb, nextText, seconds, label, prLine) {
    const s = (seconds != null ? seconds : REST_SECONDS);
    restCb = cb || null; restRemain = s; restEnd = Date.now() + s * 1000;
    if (restLabel) restLabel.textContent = label || "Rest";
    restNext.textContent = nextText || ""; if (restPr) restPr.textContent = prLine || "";   // 4.2 — PR moment visible inside the rest overlay
    restEl.hidden = false; paintRest();
    if (restInt) clearInterval(restInt);
    restInt = setInterval(() => { restRemain = Math.ceil((restEnd - Date.now()) / 1000); if (restRemain <= 0) { doneRest(); } else paintRest(); }, 250);
  }
  function paintRest() { const m = Math.floor(Math.max(0, restRemain) / 60), s = Math.max(0, restRemain) % 60; restTime.textContent = `${m}:${String(s).padStart(2, "0")}`; }
  function doneRest() { stopRest(); chime(); buzz([200, 80, 200]); if (restCb) { const cb = restCb; restCb = null; cb(); } }
  function stopRest() { if (restInt) clearInterval(restInt); restInt = null; restEnd = 0; restEl.hidden = true; }
  restEl.querySelectorAll("[data-rest]").forEach(b => b.addEventListener("click", () => { restRemain = Math.max(0, restRemain + parseInt(b.dataset.rest, 10)); restEnd = Date.now() + restRemain * 1000; paintRest(); }));
  document.getElementById("rest-skip").addEventListener("click", () => doneRest());
  document.addEventListener("visibilitychange", () => { if (document.hidden || !restInt) return; restRemain = Math.ceil((restEnd - Date.now()) / 1000); if (restRemain <= 0) doneRest(); else paintRest(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && guided) acquireWake(); });   // 4.1 — iOS drops the wake lock on background; re-take it on return

  // ---------- audio / haptics ----------
  let actx = null;
  function primeAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} }
  function chime() { try { primeAudio(); const t = actx.currentTime; [[880, 0, .18], [1320, .14, .22]].forEach(([f, o, d]) => { const osc = actx.createOscillator(), g = actx.createGain(); osc.type = "sine"; osc.frequency.value = f; g.gain.setValueAtTime(.0001, t + o); g.gain.exponentialRampToValueAtTime(.16, t + o + .02); g.gain.exponentialRampToValueAtTime(.0001, t + o + d); osc.connect(g).connect(actx.destination); osc.start(t + o); osc.stop(t + o + d + .05); }); } catch (e) {} }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p || 16); } catch (e) {} }

  // ---------- export / restore (2.3) ----------
  async function exportData() {
    const txt = JSON.stringify(store);
    store.lastBackup = new Date().toISOString(); save(store);
    const fname = `cairn-backup-${new Date().toISOString().slice(0, 10)}.json`;
    // 2.3c — iOS share sheet with the file; clipboard is the fallback
    try {
      const file = new File([txt], fname, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Cairn backup" }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(txt); alert("Backup copied to clipboard. Paste it somewhere safe."); return; } catch (e) {} }
    prompt("Copy your data:", txt);
  }
  // 2.3b — restore behind a preview (counts + newest date) so a truncated paste can't silently wipe everything
  function renderRestore() {
    screen.innerHTML = `
      <button class="back" id="rs-back">Back</button>
      <p class="exhead__idx">Restore</p>
      <h1 class="exhead__name">Restore from a backup</h1>
      <p class="feel__note" style="margin-top:8px">Paste a backup below. Nothing is replaced until you confirm.</p>
      <textarea class="note" id="rs-in" placeholder="Paste your backup JSON here" style="min-height:130px;margin-top:12px"></textarea>
      <button class="btn btn--ghost" id="rs-preview" style="margin-top:12px">Preview this backup</button>
      <div id="rs-info" style="margin-top:16px"></div>`;
    document.getElementById("rs-back").addEventListener("click", () => history.back());
    document.getElementById("rs-preview").addEventListener("click", () => {
      const raw = document.getElementById("rs-in").value.trim(), info = document.getElementById("rs-info");
      let obj; try { obj = JSON.parse(raw); } catch (e) { info.innerHTML = `<p class="coach" style="color:var(--acc)">That isn't valid JSON — the paste may be cut off.</p>`; return; }
      if (!obj || typeof obj !== "object" || !("sessions" in obj)) { info.innerHTML = `<p class="coach" style="color:var(--acc)">That doesn't look like a Cairn backup.</p>`; return; }
      const nS = Object.keys(obj.sessions || {}).length, nW = (obj.bodyweight || []).length, nM = (obj.movement || []).length;
      const dates = Object.values(obj.sessions || {}).map(s => s.date).filter(Boolean).sort();
      const newest = dates.length ? fmtDate(dates[dates.length - 1]) : "—";
      info.innerHTML = `<div class="exmeta">
          <div class="exmeta__row"><span class="exmeta__l">Sessions</span><span class="exmeta__v">${nS}</span></div>
          <div class="exmeta__row"><span class="exmeta__l">Weigh-ins</span><span class="exmeta__v">${nW}</span></div>
          <div class="exmeta__row"><span class="exmeta__l">Movement</span><span class="exmeta__v">${nM}</span></div>
          <div class="exmeta__row"><span class="exmeta__l">Newest</span><span class="exmeta__v">${newest}</span></div>
        </div>
        <button class="btn btn--solid btn--danger" id="rs-commit" style="margin-top:18px">Replace current data</button>`;
      document.getElementById("rs-commit").addEventListener("click", () => {
        if (!confirm(`Replace everything with this backup — ${nS} sessions, ${nW} weigh-ins?`)) return;
        store = obj; store.sessions = store.sessions || {};
        if ((store.schema || 1) < CURRENT_SCHEMA) migrate(store);   // 2.5 — migrate on import too
        save(store); view = { name: "home" }; render(); alert("Restored.");
      });
    });
  }
  async function resetApp() {
    if (!confirm("Erase everything — all sessions, bodyweight, and the cached app — and start fresh? This can't be undone.")) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) {}
    try { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } } catch (e) {}
    store = blank(); location.reload();
  }

  // ---------- formatting ----------
  function fmtN(n) { n = parseFloat(n) || 0; return n % 1 === 0 ? String(n) : n.toFixed(1); }
  function fmtVol(n) { n = Math.round(n || 0); return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { return ""; } }

  // ---------- tabs ----------
  tabbar.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab;
    if (t === "train") { view = { name: "train" }; render(); }   // preview the active-or-planned session; no phantom "current"
    else { view = { name: "home" }; render(); }
  }));

  // ---------- boot ----------
  history.replaceState({ v: "home" }, "");
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}   // 2.2 — ask to keep storage from eviction
  if (!store.onboarded && Object.keys(store.sessions || {}).length === 0) renderOnboard(); else render();
  try {
    if (store.remind && "Notification" in window && Notification.permission === "granted" && isTrainingDay() && !trainedToday()) {
      // 2.6 — iOS has no window `new Notification()`; go through the service worker registration
      const body = "You, Faisal and Yazan. Let's go.";
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((r) => r.showNotification("Training day", { body })).catch(() => {});
      } else if ("Notification" in window) {
        new Notification("Training day", { body });
      }
    }
  } catch (e) {}
})();
