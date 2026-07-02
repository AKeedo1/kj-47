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
  const DAY_LABELS = { monday: "Monday", wednesday: "Wednesday", saturday: "Saturday" };
  const CREW = ["Faisal", "Yazan"];
  const TIERS = [
    { n: "Bronze", min: 0 }, { n: "Iron", min: 300 }, { n: "Steel", min: 800 },
    { n: "Onyx", min: 1600 }, { n: "Slate", min: 2800 }, { n: "Crimson", min: 4400 }, { n: "Apex", min: 6500 }
  ];
  const JOINTS = ["Back", "Knee", "Ankle", "Shoulder"];
  const JOINT_LOAD = {
    Knee: ["goblet_squat", "leg_press", "wall_sit"],
    Back: ["db_rdl", "good_morning"],
    Ankle: ["calf_raise", "seated_calf_raise", "goblet_squat", "wall_sit"],
    Shoulder: ["db_shoulder_press", "machine_shoulder_press", "lateral_raise", "incline_db_press", "db_bench_press", "overhead_tricep_extension"]
  };
  // Marcus's progression engine — load increments (kg total) per movement
  const STEP = {
    leg_press: 5, machine_chest_press: 5, machine_row: 5, lat_pulldown: 5, seated_cable_row: 5,
    machine_shoulder_press: 5, tricep_pushdown: 5, cable_curl: 5, pallof_press: 5, assisted_pullup: 5,
    goblet_squat: 2.5, db_bench_press: 2.5, incline_db_press: 2.5, db_shoulder_press: 2.5, db_rdl: 2.5,
    good_morning: 2.5, suitcase_carry: 2.5, bicep_curl: 2.5, hammer_curl: 2.5, lateral_raise: 2.5,
    overhead_tricep_extension: 2.5, calf_raise: 2.5, seated_calf_raise: 2.5, wall_sit: 0, bike_finisher: 0
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
    bump_load: "Clean last week, all reps. Up a step. Earn it."
  };

  // ---------- store ----------
  const blank = () => ({ schema: 2, started: null, onboarded: false, sessions: {}, current: null, bodyweight: [] });
  function load() {
    try { const r = localStorage.getItem(KEY); const s = r ? JSON.parse(r) : blank(); s.sessions = s.sessions || {}; return s; }
    catch (e) { return blank(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  function dateKey(day) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}__${day}`;
  }
  function getSession(s, day) {
    const k = dateKey(day);
    if (!s.sessions[k]) {
      s.sessions[k] = { day, date: new Date().toISOString(), feel: null, joint: null, crew: { Faisal: false, Yazan: false }, swaps: {}, exercises: {}, completedAt: null };
      save(s);
    }
    return { key: k, session: s.sessions[k] };
  }

  // ---------- day routing ----------
  function todayDay() {
    const d = new Date().getDay(); // 0 Sun .. 6 Sat
    if (d === 1) return "monday";
    if (d === 3) return "wednesday";
    if (d === 6) return "saturday";
    if (d === 0 || d === 2) return d === 0 ? "monday" : "wednesday";
    return "saturday"; // Thu/Fri -> Sat
  }
  function isTrainingDay() { const d = new Date().getDay(); return d === 1 || d === 3 || d === 6; }
  function nextDayLabel() {
    const d = new Date().getDay();
    if (d === 0 || d === 1) return "Monday"; if (d === 2 || d === 3) return "Wednesday";
    return "Saturday";
  }
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

  // ---------- derivation (pure over store) ----------
  const epley = (w, r) => { w = +w || 0; r = +r || 0; return r > 0 ? w * (1 + r / 30) : w; };
  const doneSets = (sess) => Object.values(sess.exercises || {}).flatMap(e => (e.sets || []).filter(st => st.done));
  const isDone = (sess) => doneSets(sess).length > 0;

  function derive(s) {
    const all = Object.values(s.sessions || {}).filter(isDone)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const prMax = {}, bestEver = {}; let totalVol = 0, totalSets = 0, prCount = 0;
    const sessionStats = [];
    all.forEach(se => {
      let sv = 0;
      Object.keys(se.exercises || {}).forEach(exId => {
        (se.exercises[exId].sets || []).forEach(st => {
          if (!st.done) return;
          const w = +st.weight || 0, r = +st.reps || 0; if (w <= 0 && r <= 0) return;
          totalSets++; totalVol += w * r; sv += w * r;
          const e = epley(w, r);
          if (!bestEver[exId] || e > bestEver[exId].e1rm) bestEver[exId] = { exId, weight: w, reps: r, e1rm: e, date: se.date };
          if (!prMax[exId]) prMax[exId] = e;                                 // first-ever seeds silently, no points
          else if (e > prMax[exId] + 0.01) { prMax[exId] = e; prCount++; }   // only genuine improvements score
        });
      });
      sessionStats.push({ date: se.date, day: se.day, volume: sv, sets: doneSets(se).length });
    });
    const points = totalSets * 10 + prCount * 40;
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
    const thisMonth = all.filter(se => { const d = new Date(se.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    const prs = Object.values(bestEver).sort((a, b) => new Date(b.date) - new Date(a.date));

    return { sessions: all.length, totalVol, totalSets, prCount, points, cur, next, frac,
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
    else if (view.name === "progress" || view.name === "sessionEdit" || view.name === "bwEdit" || view.name === "settings") { view = view.back || { name: "home" }; render(); }
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
    else if (view.name === "settings") { setTabbar("home", false); renderSettings(); }
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
    return `<div class="section"><div class="section__head"><span class="section__title">Bodyweight</span></div>
      ${headline}
      ${bw.length > 1 ? lineChart(bw.map(x => x.kg)) : ""}
      <button class="btn btn--ghost" id="log-bw" style="margin-top:14px">Log weight</button><div id="bw-form" hidden style="margin-top:12px"></div>
      <button class="pglink" id="bw-edit">Edit entries</button></div>`;
  }
  function wireBodyweight() {
    const eb = document.getElementById("bw-edit"); if (eb) eb.addEventListener("click", () => go({ name: "bwEdit", back: { name: "home" } }));
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
      <div class="logger" id="bw-list" style="margin-top:20px"></div>
      <button class="btn btn--ghost" id="log-bw" style="margin-top:20px">Log weight</button><div id="bw-form" hidden style="margin-top:12px"></div>
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
      row.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => { inp.value = Math.max(0, (parseFloat(inp.value) || 0) + parseFloat(b.dataset.d)); store.bodyweight[idx].kg = parseFloat(inp.value) || 0; save(store); }));
      inp.addEventListener("input", () => { const v = parseFloat(inp.value); if (v) { store.bodyweight[idx].kg = v; save(store); } });
      row.querySelector("[data-del]").addEventListener("click", () => { if (!confirm("Remove this weigh-in?")) return; store.bodyweight.splice(idx, 1); save(store); renderBwEdit(); });
      box.appendChild(row);
    });
  }
  function renderHome() {
    const d = derive(store);
    const recent = Object.entries(store.sessions || {}).filter(([k, se]) => isDone(se)).map(([k, se]) => ({ key: k, date: se.date, day: se.day, sets: doneSets(se).length, vol: doneSets(se).reduce((a, s) => a + (+s.weight || 0) * (+s.reps || 0), 0) })).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const doneAll = Object.values(store.sessions || {}).filter(isDone);
    const doneDesc = doneAll.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    let crewStreak = 0; for (const s of doneDesc) { if (s.crew && (s.crew.Faisal || s.crew.Yazan)) crewStreak++; else break; }
    const crewLast = doneDesc.slice(0, 10); const crewIn = {}; CREW.forEach(c => crewIn[c] = crewLast.filter(s => s.crew && s.crew[c]).length);
    const resume = store.current && store.sessions[store.current] && !store.sessions[store.current].completedAt && isDone(store.sessions[store.current]);
    const startDay = resume ? store.sessions[store.current].day : plannedDay();
    const startTitle = (PROGRAM[startDay] || {}).title || "Session";

    if (d.sessions === 0 && !resume) { renderHomeZero(startDay, startTitle); return; }

    const nextLine = isTrainingDay() ? "Today" : `Next session · ${nextDayLabel()}`;
    const cells = d.weeks.map(w => {
      const lv = w.sess >= 3 ? "l3" : w.sess === 2 ? "l2" : w.sess === 1 ? "l1" : "";
      return Array.from({ length: 3 }, (_, i) => `<span class="weeks__cell ${i < w.sess ? lv : ""}"></span>`).join("");
    }).join("");
    const maxVol = Math.max(1, ...d.weeks.map(w => w.vol));

    let btb = "";
    if (!resume && doneDesc[0]) {
      const hrs = (Date.now() - new Date(doneDesc[0].date).getTime()) / 3600000;
      if (hrs < 20) btb = `<p class="start__btb">Trained ${hrs < 1 ? "under an hour" : Math.round(hrs) + "h"} ago — this'll be back-to-back. Fine now and then; ~48h between sessions is the sweet spot.</p>`;
    }

    screen.innerHTML = `
      <div class="home__top"><span class="home__brand">Cairn</span><span class="kicker">${nextLine}</span></div>

      <p class="kicker">Rank</p>
      <h1 class="rank__tier">${d.cur.n}</h1>
      <div class="meter"><span class="meter__fill" id="home-meter"></span></div>
      <div class="rank__row">
        <span class="rank__pts">${d.points} points</span>
        <span class="rank__next">${d.next ? `<b>${Math.max(0, d.next.min - d.points)} to ${d.next.n}</b>` : "Apex reached"}</span>
      </div>

      <div class="start">
        <div class="start__meta"><span class="start__day">${startTitle.split(" — ")[0]}</span><span class="start__sub">${(startTitle.split(" — ")[1] || "")}</span></div>
        ${resume ? "" : `<div class="pick" id="day-pick">${ROTATION.map(dk => `<button class="pick__chip ${dk === startDay ? "is-sel" : ""}" data-pick="${dk}">${DAY_SHORT[dk]}</button>`).join("")}</div>`}
        <button class="btn btn--solid" id="start-btn">${resume ? "Resume session" : "Start session"}</button>
        <p class="start__rest">${resume ? "Pick up where you left off." : isTrainingDay() ? `With Faisal and Yazan · ${d.thisWeek} of 3 this week.` : `Train any day — ${d.thisWeek} of 3 this week. Switch the session above.`}</p>
        ${btb}
      </div>

      ${!isTrainingDay() ? `<div class="section"><div class="section__head"><span class="section__title">Rest day</span></div>
        <div class="warm"><p class="warm__aero">Recovery, not nothing — keep the blood moving.</p><ul class="warm__list"><li>20-30 min easy walk</li><li>Ankle rocks and short-foot holds — flat feet love daily reps</li><li>Band pull-aparts × 20 for the upper back</li><li>Log today's bodyweight if you haven't</li></ul></div>
      </div>` : ""}

      <div class="stats">
        <div class="stat"><div class="v">${d.sessions}</div><div class="u">Sessions</div></div>
        <div class="stat"><div class="v">${d.thisMonth}</div><div class="u">This month</div></div>
        <div class="stat"><div class="v">${fmtVol(d.totalVol)}</div><div class="u">Kg lifted</div></div>
        <div class="stat"><div class="v">${d.crewSessions}</div><div class="u">With the crew</div></div>
      </div>

      <div class="section">
        <div class="section__head"><span class="section__title">Showing up</span><span class="section__aside">${d.thisWeek} of 3 this week</span></div>
        <div class="weeks">${cells}</div>
      </div>

      <div class="section"><div class="section__head"><span class="section__title">The crew</span>${crewStreak > 1 ? `<span class="section__aside">${crewStreak}-session streak</span>` : ""}</div>
        ${CREW.map(c => `<div class="pr"><span class="pr__name">${c}</span><span class="pr__val">${crewIn[c]}<small>of last ${crewLast.length || 0}</small></span></div>`).join("")}
        ${crewStreak > 1 ? `<p class="coach" style="margin-top:12px">${crewStreak} sessions as a crew. Don't be the one who breaks it.</p>` : ""}
      </div>

      <div class="section">
        <div class="section__head"><span class="section__title">Volume</span><span class="section__aside">Last 6 weeks</span></div>
        <div class="chart">
          ${d.weeks.map(w => `<div class="chart__col"><span class="chart__bar ${w.vol > 0 ? "is-on" : ""}" style="height:${Math.max(3, (w.vol / maxVol) * 100)}%"></span><span class="chart__lbl">${weekLbl(w.start)}</span></div>`).join("")}
        </div>
      </div>

      ${d.prs.length ? `<div class="section">
        <div class="section__head"><span class="section__title">Personal bests</span></div>
        ${d.prs.slice(0, 6).map(p => { const lib = EXERCISE_LIBRARY[p.exId] || { name: p.exId }; return `<button class="pr" data-prex="${p.exId}"><span class="pr__name">${lib.name}</span><span class="pr__val">${fmtN(p.weight)}<small>kg × ${p.reps}</small></span></button>`; }).join("")}
      </div>` : ""}

      <div class="section">
        <div class="section__head"><span class="section__title">Rank ladder</span></div>
        <div class="ladder">
          ${TIERS.map(t => `<div class="ladder__row ${t.n === d.cur.n ? "is-cur" : ""}"><span class="ladder__n">${t.n}</span><span class="ladder__p">${t.min} pts</span></div>`).join("")}
        </div>
      </div>

      ${recent.length ? `<div class="section">
        <div class="section__head"><span class="section__title">Recent sessions</span><span class="section__aside">tap to edit</span></div>
        <div class="hist">
          ${recent.map(h => `<button class="hist__row" data-editkey="${h.key}"><span class="hist__day">${DAY_LABELS[h.day] || h.day}</span><span class="hist__meta">${fmtDate(h.date)} · ${h.sets} sets · ${fmtVol(h.vol)} kg</span></button>`).join("")}
        </div>
      </div>` : ""}

      ${bwSection()}

      <div class="foot"><span class="foot__link">Cairn</span><button class="foot__link" id="settings-btn">Settings</button></div>
    `;

    requestAnimationFrame(() => { const m = document.getElementById("home-meter"); if (m) m.style.width = (d.frac * 100).toFixed(1) + "%"; });
    document.getElementById("start-btn").addEventListener("click", () => startSession(startDay));
    screen.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { dayPick = b.dataset.pick; renderHome(); }));
    document.getElementById("settings-btn").addEventListener("click", () => go({ name: "settings", back: { name: "home" } }));
    screen.querySelectorAll("[data-prex]").forEach(b => b.addEventListener("click", () => go({ name: "progress", exId: b.dataset.prex, back: { name: "home" } })));
    screen.querySelectorAll("[data-editkey]").forEach(b => b.addEventListener("click", () => go({ name: "sessionEdit", key: b.dataset.editkey, back: { name: "home" } })));
    wireBodyweight();
  }

  function renderHomeZero(day, title) {
    screen.innerHTML = `
      <div class="home__top"><span class="home__brand">Cairn</span><span class="kicker">${isTrainingDay() ? "Today" : "Next · " + nextDayLabel()}</span></div>
      <div class="zero">
        <p class="kicker">Rank</p>
        <h1 class="rank__tier">Bronze</h1>
        <div class="meter"><span class="meter__fill" style="width:0"></span></div>
        <div class="rank__row"><span class="rank__pts">0 points</span><span class="rank__next"><b>300 to Iron</b></span></div>
        <p class="zero__line" style="margin-top:30px">This is the starting line.</p>
        <p class="zero__sub">Six weeks, three days a week — you, Faisal, and Yazan. Log your first set and the journey starts filling in: rank, volume, every personal best.</p>
      </div>
      <div class="start" style="margin-top:30px">
        <div class="start__meta"><span class="start__day">${title.split(" — ")[0]}</span><span class="start__sub">${(title.split(" — ")[1] || "")}</span></div>
        <button class="btn btn--solid" id="start-btn">Start session one</button>
      </div>
      ${bwSection()}
      <div class="section">
        <div class="section__head"><span class="section__title">Rank ladder</span></div>
        <div class="ladder">${TIERS.map((t, i) => `<div class="ladder__row ${i === 0 ? "is-cur" : ""}"><span class="ladder__n">${t.n}</span><span class="ladder__p">${t.min} pts</span></div>`).join("")}</div>
      </div>`;
    document.getElementById("start-btn").addEventListener("click", () => startSession(day));
    wireBodyweight();
  }

  // ---------- TRAIN (session overview) ----------
  function startSession(day) {
    dayPick = null;
    const { key } = getSession(store, day);
    store.current = key; if (!store.started) store.started = new Date().toISOString(); save(store);
    primeAudio();
    view = { name: "train", day }; history.pushState({ v: "train" }, ""); render();
  }

  function currentDay() {
    if (store.current && store.sessions[store.current]) return store.sessions[store.current].day;
    return todayDay();
  }

  function renderTrain() {
    const day = currentDay();
    const prog = PROGRAM[day]; if (!prog) { view = { name: "home" }; renderHome(); return; }
    const { session } = getSession(store, day);
    const mod = feelMod(session);
    const active = !!(store.current && store.sessions[store.current] && store.sessions[store.current].day === day && !store.sessions[store.current].completedAt);

    screen.innerHTML = `
      <div class="shead">
        <p class="kicker">Phase 1 · Week ${programWeek()} of 6 · ${active ? fmtDate(new Date().toISOString()) : "preview"}</p>
        <h1 class="shead__day">${prog.title.split(" — ")[0]}</h1>
        <p class="shead__sub">${prog.subtitle}</p>
      </div>
      ${programWeek() === 4 ? `<div class="warm" style="border-color:var(--acc)"><p class="warm__t">Deload week</p><p class="warm__aero">Still train — same days, same reps, just 10% lighter. This is the week your tendons and joints catch up to the muscle. Don't skip it, and don't chase weight.</p></div>` : ""}

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
          const scheme = st.completed ? '<span class="excard__check">done</span>' : `${ex.sets} × ${st.rxReps || ex.reps}${st.rxWeight ? " · " + st.rxWeight + " kg" : ""}`;
          return `<button class="excard ${st.completed ? "is-done" : ""}" data-ex="${i}">
            <div class="excard__top"><span class="excard__name">${lib.name}${exId !== ex.id ? ' <span class="sw">swap</span>' : ""}</span><span class="excard__scheme">${scheme}</span></div>
            <div class="excard__last">${lastStr}</div>
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
    for (const day of ["monday", "wednesday", "saturday"]) { const f = (PROGRAM[day].exercises || []).find(e => e.id === exId); if (f) return f; }
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
        <div class="hist">${s.slice().reverse().map(x => `<div class="hist__row" style="cursor:default"><span class="hist__day">${DAY_LABELS[x.day] || fmtDate(x.date)}</span><span class="hist__meta">${fmtDate(x.date)} · ${x.sets.map(z => `${fmtN(z.weight)}×${z.reps}`).join(", ")}</span></div>`).join("")}</div>
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
        <button class="setrow__log ${set.done ? "" : "is-off"}">${set.done ? "logged" : "off"}</button>`;
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
    const prog = PROGRAM[se.day] || { title: se.day, exercises: [] };
    const exIds = Object.keys(se.exercises || {}).filter(exId => (se.exercises[exId].sets || []).some(s => s.done));
    screen.innerHTML = `
      <button class="back" id="se-back">Back</button>
      <p class="exhead__idx">Edit session</p>
      <h1 class="exhead__name">${(prog.title || se.day).split(" — ")[0]}</h1>
      <p class="shead__sub">${fmtDate(se.date)}${se.completedAt ? " · complete" : " · in progress"}</p>
      <textarea class="note" id="se-note" placeholder="How did it go?">${se.note || ""}</textarea>
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
      <div class="section"><p class="section__title">Data</p>
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
    document.getElementById("s-restore").addEventListener("click", importData);
    document.getElementById("s-reset").addEventListener("click", resetApp);
  }
  function trainedToday() { const t = new Date().toDateString(); return Object.values(store.sessions || {}).some(s => isDone(s) && new Date(s.date).toDateString() === t); }

  // ---------- EXERCISE detail ----------
  function renderExercise(idx) {
    const day = currentDay(); const prog = PROGRAM[day]; const ex = prog.exercises[idx];
    const { session } = getSession(store, day); const exId = effId(session, idx, ex); const lib = EXERCISE_LIBRARY[exId];
    const mod = feelMod(session); const last = lastPerformance(store, exId);
    ensureSets(session, exId, ex.sets, last, ex);
    const st = session.exercises[exId];
    const flaggedJoint = session.feel === "joints" && session.joint && (JOINT_LOAD[session.joint] || []).includes(exId) ? session.joint : null;
    let jointAlt = null;
    if (flaggedJoint) { const cands = (lib.swaps || []).filter(s => EXERCISE_LIBRARY[s]); jointAlt = cands.find(s => !(JOINT_LOAD[flaggedJoint] || []).includes(s)) || null; }

    screen.innerHTML = `
      <button class="back" id="ex-back">Back</button>
      <p class="exhead__idx">Exercise ${idx + 1} of ${prog.exercises.length}${exId !== ex.id ? " · swapped" : ""}</p>
      <h1 class="exhead__name">${lib.name}</h1>
      <p class="exhead__cue">${lib.cue}</p>
      ${st.reason ? `<p class="coach">${st.reason}</p>` : ""}
      ${flaggedJoint ? (jointAlt ? `<div class="jointswap"><p class="coach" style="margin-top:0">Your ${flaggedJoint.toLowerCase()} is flagged. ${EXERCISE_LIBRARY[jointAlt].name} spares it today.</p><button class="btn btn--outline" id="joint-swap">Swap to ${EXERCISE_LIBRARY[jointAlt].name}</button></div>` : `<div class="jointswap"><p class="coach" style="margin-top:0">Your ${flaggedJoint.toLowerCase()} is flagged, and nothing here truly spares it. Light feeler only, stop if it bites — or skip it today.</p><button class="btn btn--outline" id="joint-skip">Skip today</button></div>`) : ""}

      <div class="demo" id="demo" data-vid="${lib.video}">
        <img class="demo__poster" src="https://i.ytimg.com/vi/${lib.video}/hqdefault.jpg" alt="" onerror="this.style.display='none'">
        <div class="demo__play"><span class="demo__playlabel">Watch the form</span></div>
      </div>
      <p class="demo__cap">${lib.videoTitle || "Form demo"}</p>

      <div class="exmeta">
        <div class="exmeta__row"><span class="exmeta__l">Today</span><span class="exmeta__v">${ex.sets} × ${st.rxReps || ex.reps}${st.rxWeight ? " · " + st.rxWeight + " kg" : " · " + ex.target}</span></div>
        <div class="exmeta__row"><span class="exmeta__l">Last time</span><span class="exmeta__v">${last ? last.map(x => `${fmtN(x.weight)}×${x.reps}`).join(", ") : "First time — log honest."}</span></div>
      </div>

      <div class="logger" id="logger"></div>
      <p class="prtext" id="ex-pr"></p>

      <button class="pglink" id="see-progress">See ${lib.name} progress</button>

      <div class="swaps"><p class="swaps__t">Machine taken? Swap</p><div class="swaps__list" id="swaps"></div></div>
    `;

    document.getElementById("ex-back").addEventListener("click", () => history.back());
    wireDemo(document.getElementById("demo"));
    renderLogger(document.getElementById("logger"), day, idx, exId, st, ex);
    renderSwaps(document.getElementById("swaps"), day, idx, exId, ex);
    document.getElementById("see-progress").addEventListener("click", () => go({ name: "progress", exId, back: { name: "exercise", idx } }));
    if (flaggedJoint && jointAlt) { const js = document.getElementById("joint-swap"); if (js) js.addEventListener("click", () => { session.swaps = session.swaps || {}; const cur = session.exercises[exId]; if (cur) { if (!session.exercises[jointAlt]) session.exercises[jointAlt] = cur; delete session.exercises[exId]; } session.swaps[idx] = jointAlt; save(store); renderExercise(idx); }); }
    if (flaggedJoint && !jointAlt) { const jk = document.getElementById("joint-skip"); if (jk) jk.addEventListener("click", () => { const s2 = session.exercises[exId]; if (s2) { s2.completed = true; s2.skipped = true; } save(store); history.back(); }); }
  }

  function renderLogger(box, day, idx, exId, st, ex) {
    box.innerHTML = "";
    st.sets.forEach((set, i) => {
      const row = document.createElement("div");
      row.className = "setrow" + (set.done ? " is-done" : "");
      row.innerHTML = `
        <span class="setrow__n">Set ${i + 1}</span>
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
        <button class="setrow__log">${set.done ? "set" : "Log"}</button>`;
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
    let cands = (lib.swaps || []).filter(id => EXERCISE_LIBRARY[id] && id !== exId);
    if (exId !== origId) cands.unshift(origId);
    if (!cands.length) { box.parentElement.hidden = true; return; }
    box.innerHTML = "";
    cands.forEach(id => {
      const b = document.createElement("button");
      b.className = "swap" + (id === origId && exId !== origId ? " is-revert" : "");
      b.textContent = (id === origId && exId !== origId ? "Revert to " : "") + EXERCISE_LIBRARY[id].name;
      b.addEventListener("click", () => {
        const { session } = getSession(store, day);
        session.swaps = session.swaps || {};
        const cur = session.exercises[exId];
        if (cur) { if (!session.exercises[id]) session.exercises[id] = cur; delete session.exercises[exId]; }
        if (id === origId) delete session.swaps[idx]; else session.swaps[idx] = id;
        save(store); renderExercise(idx);
      });
      box.appendChild(b);
    });
  }

  // ---------- GUIDED runner ----------
  function startGuided() {
    const day = currentDay(); const prog = PROGRAM[day]; const { session } = getSession(store, day);
    primeAudio();
    // first incomplete exercise / set
    let exIdx = 0, setIdx = 0;
    for (let i = 0; i < prog.exercises.length; i++) {
      const exId = effId(session, i, prog.exercises[i]); ensureSets(session, exId, prog.exercises[i].sets, lastPerformance(store, exId), prog.exercises[i]);
      const st = session.exercises[exId];
      const u = st.sets.findIndex(s => !s.done);
      if (u !== -1) { exIdx = i; setIdx = u; break; }
      if (i === prog.exercises.length - 1) return finishSession();
    }
    guided = { day, exIdx, setIdx, state: "set" };
    go({ name: "guided" });
  }

  function renderGuided() {
    if (!guided) { view = { name: "train" }; renderTrain(); return; }
    const { day } = guided; const prog = PROGRAM[day]; const { session } = getSession(store, day);
    if (guided.exIdx >= prog.exercises.length) return finishSession();
    const ex = prog.exercises[guided.exIdx]; const exId = effId(session, guided.exIdx, ex); const lib = EXERCISE_LIBRARY[exId];
    ensureSets(session, exId, ex.sets, lastPerformance(store, exId), ex);
    const st = session.exercises[exId];
    while (guided.setIdx < st.sets.length && st.sets[guided.setIdx].done) guided.setIdx++;
    if (guided.setIdx >= st.sets.length) { guided.exIdx++; guided.setIdx = 0; return renderGuided(); }

    const set = st.sets[guided.setIdx]; const mod = feelMod(session);
    const feeler = guided.setIdx === 0;
    const total = prog.exercises.length;
    const frac = (guided.exIdx + guided.setIdx / Math.max(1, ex.sets)) / total;

    screen.innerHTML = `
      <div class="guided">
        <div class="gbar"><button class="gbar__x" id="g-exit">Exit</button><span class="gbar__track"><span class="gbar__fill" style="width:${(frac * 100).toFixed(0)}%"></span></span></div>
        <p class="gstep">Exercise ${guided.exIdx + 1} of ${total}</p>
        <h1 class="gname">${lib.name}</h1>
        <p class="gcue">${lib.cue}</p>
        <div class="gdemo" id="g-demo" hidden></div>
        <div class="gset">
          ${feeler ? `<p class="gfeeler">Feeler set — ramp up, lighter</p>` : ""}
          <p class="gset__lbl">Set ${guided.setIdx + 1} of ${ex.sets} · target ${st.rxReps || ex.reps} reps</p>
          ${!feeler && st.reason ? `<p class="coach" style="text-align:center;max-width:32ch;margin:0 auto 14px">${st.reason}</p>` : ""}
          <div class="ginputs">
            <div class="ginput"><div class="ginput__row"><button class="ginput__b" data-gw="-2.5">&minus;</button><span class="ul-fx" id="g-ulw"><input class="ginput__f" id="g-weight" inputmode="decimal" value="${set.weight}"></span><button class="ginput__b" data-gw="2.5">+</button></div><span class="ginput__u">kg</span></div>
            <div class="ginput"><div class="ginput__row"><button class="ginput__b" data-gr="-1">&minus;</button><input class="ginput__f" id="g-reps" inputmode="numeric" value="${set.reps}"><button class="ginput__b" data-gr="1">+</button></div><span class="ginput__u">reps</span></div>
          </div>
          <p class="gprtext" id="g-pr"></p>
          ${!feeler ? `<div class="grpe" id="g-rpe"><button class="grpe__b ${set.rpe === "easy" ? "is-sel" : ""}" data-rpe="easy">Had more</button><button class="grpe__b ${set.rpe === "ontarget" ? "is-sel" : ""}" data-rpe="ontarget">On it</button><button class="grpe__b ${set.rpe === "grind" ? "is-sel" : ""}" data-rpe="grind">Grinding</button></div>` : ""}
          <button class="btn btn--solid glog" id="g-log">Log set</button>
          <div class="gquick"><button class="gquick__b" id="g-demo-btn">Watch how</button><button class="gquick__b" id="g-skip">Skip exercise</button><button class="gquick__b" id="g-swap">Swap</button></div>
        </div>
      </div>`;

    const wIn = document.getElementById("g-weight"), rIn = document.getElementById("g-reps");
    document.querySelectorAll("[data-gw]").forEach(b => b.addEventListener("click", () => { wIn.value = Math.max(0, (parseFloat(wIn.value) || 0) + parseFloat(b.dataset.gw)); }));
    document.querySelectorAll("[data-gr]").forEach(b => b.addEventListener("click", () => { rIn.value = Math.max(0, (parseInt(rIn.value, 10) || 0) + parseInt(b.dataset.gr, 10)); }));
    document.getElementById("g-log").addEventListener("click", () => {
      set.weight = wIn.value; set.reps = rIn.value; set.done = true;
      st.completed = st.sets.every(s => s.done);
      persist(day);
      const pr = checkPR(exId, set);
      const ulw = document.getElementById("g-ulw"); ulw.classList.remove("is-on"); void ulw.offsetWidth; ulw.classList.add("is-on");
      buzz(); document.getElementById("g-pr").textContent = prText(pr);
      const lastSet = guided.setIdx >= ex.sets - 1, lastEx = guided.exIdx >= total - 1;
      if (lastSet && lastEx) { setTimeout(finishSession, 700); return; }
      guided.setIdx = lastSet ? 0 : guided.setIdx + 1; if (lastSet) guided.exIdx++;
      let nextText;
      if (lastSet) { const ne = prog.exercises[guided.exIdx]; const nl = ne ? EXERCISE_LIBRARY[effId(session, guided.exIdx, ne)] : null; nextText = nl ? "Next: " + nl.name : "Last set"; }
      else nextText = "Next: set " + (guided.setIdx + 1);
      const rs = restFor(exId); if (rs > 0) startRest(() => renderGuided(), nextText, rs); else renderGuided();
    });
    document.getElementById("g-exit").addEventListener("click", () => exitGuided(true));
    document.getElementById("g-skip").addEventListener("click", () => { if (confirm("Skip this exercise?")) { guided.exIdx++; guided.setIdx = 0; renderGuided(); } });
    document.getElementById("g-swap").addEventListener("click", () => { const i = guided.exIdx; exitGuided(false); go({ name: "exercise", idx: i }); });
    screen.querySelectorAll("#g-rpe .grpe__b").forEach(b => b.addEventListener("click", () => { set.rpe = set.rpe === b.dataset.rpe ? null : b.dataset.rpe; save(store); document.querySelectorAll("#g-rpe .grpe__b").forEach(x => x.classList.toggle("is-sel", x.dataset.rpe === set.rpe)); }));
    document.getElementById("g-demo-btn").addEventListener("click", () => {
      const gd = document.getElementById("g-demo");
      if (gd.hidden) { gd.innerHTML = `<div class="demo" style="margin-top:12px"><iframe src="https://www.youtube.com/embed/${lib.video}?rel=0&modestbranding=1&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`; gd.hidden = false; }
      else { gd.innerHTML = ""; gd.hidden = true; }
    });
  }

  function exitGuided(confirmFirst) {
    if (confirmFirst && isDone(getSession(store, guided.day).session) && !confirm("Exit the session? Your logs are saved.")) return;
    stopRest(); guided = null; view = { name: "train" }; render();
  }

  // ---------- FINISH ----------
  function finishSession() {
    const day = guided ? guided.day : currentDay(); const { session } = getSession(store, day);
    const before = derive(store).points;
    session.completedAt = new Date().toISOString();
    save(store);
    stopRest(); guided = null;
    view = { name: "finish", before, day }; render();
  }

  function renderFinish() {
    const day = view.day; const prog = PROGRAM[day] || { title: "Session" };
    const d = derive(store);
    const { session } = getSession(store, day);
    const sets = doneSets(session).length;
    const vol = doneSets(session).reduce((a, s) => a + (+s.weight || 0) * (+s.reps || 0), 0);
    const beforeFrac = (() => { let ti = 0; TIERS.forEach((t, i) => { if (view.before >= t.min) ti = i; }); const c = TIERS[ti], n = TIERS[ti + 1]; return n ? Math.max(0, Math.min(1, (view.before - c.min) / (n.min - c.min))) : 1; })();
    const inCount = session.crew ? CREW.filter(c => session.crew[c]).length : 0;
    const crewLine = inCount === 2 ? "All three of you showed up." : inCount === 1 ? `${CREW.find(c => session.crew[c])} showed up with you.` : "Solo today — still counts.";
    const fwd = d.next ? `${Math.max(0, d.next.min - d.points)} points to ${d.next.n}` : "Apex reached";
    const weekLine = d.thisWeek >= 3 ? "Full week — three of three." : `${d.thisWeek} of 3 this week.`;

    screen.innerHTML = `
      <div class="finish">
        <img class="brandmark" src="icons/cairn-outline.png" alt="" />
        <p class="finish__k">${prog.title.split(" — ")[0]} · ${DAY_LABELS[day] || day}</p>
        <h1 class="finish__h">Done.</h1>
        <p class="finish__sub">${sets} sets logged. ${crewLine}</p>
        <p class="finish__sub" style="margin-top:6px">${weekLine} ${nextDayLabel()} gets you closer — ${fwd}.</p>
        <div class="finish__stat">
          <div><div class="v">${fmtVol(vol)}</div><div class="u">Kg this session</div></div>
          <div><div class="v">${d.cur.n}</div><div class="u">Rank</div></div>
        </div>
        <div class="finish__meter">
          <div class="rank__row"><span class="rank__pts">${d.points} points</span><span class="rank__next">${d.next ? `<b>${Math.max(0, d.next.min - d.points)} to ${d.next.n}</b>` : "Apex"}</span></div>
          <div class="meter"><span class="meter__fill" id="f-meter"></span></div>
        </div>
        <textarea class="note" id="finish-note" placeholder="How did it go? One line for Marcus.">${session.note || ""}</textarea>
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
  function feelMod(session) { const o = FEEL_OPTIONS.find(x => x.id === session.feel); return o ? o.loadModifier : 1; }
  // ---- progression engine (Marcus's brain) ----
  function programWeek() { if (!store.started) return 1; const d = Math.floor((Date.now() - new Date(store.started).getTime()) / 86400000); return Math.min(6, Math.max(1, Math.floor(d / 7) + 1)); }
  function startWeight(exId, ex) { return (typeof STARTING_WEIGHTS !== "undefined" && STARTING_WEIGHTS[exId]) || parseTargetKg(ex.target) || 0; }
  function stepFor(exId) { return STEP[exId] != null ? STEP[exId] : 2.5; }
  function exHistory(exId) {
    const cur = store.current, out = [];
    Object.entries(store.sessions || {}).forEach(([k, se]) => {
      if (k === cur) return; const e = se.exercises && se.exercises[exId]; if (!e || !e.sets) return;
      const working = e.sets.filter((s, i) => i >= 1 && s.done);   // set 0 is the feeler, excluded
      if (!working.length) return;
      out.push({ date: se.date, feel: se.feel, reps: working.map(s => +s.reps || 0), weight: Math.max(...working.map(s => +s.weight || 0)), grind: working.some(s => s.rpe === "grind") });
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
    if (feel === "joints" || (last && last.feel === "joints")) return { weight: round25(base * 0.8), reps: Tmin, reason: R.joints, feelerPct: 0.5 };
    if (week === 4) return { weight: round25(base * 0.9), reps: Tmin, reason: R.deload_week, feelerPct: 0.6 };
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
  function scaledScheme(ex, mod) { return `${ex.sets} × ${ex.reps}`; }
  function scaledTarget(ex, mod, session, exId, feeler) {
    const last = lastPerformance(store, exId); const lw = last && last[0] ? parseFloat(last[0].weight) : null;
    if (feeler) return "ramp set";
    if (lw && mod < 1) return `down ${Math.round((1 - mod) * 100)}% — ~${Math.round(lw * mod / 2.5) * 2.5} kg`;
    if (lw) return `last ${fmtN(lw)} kg · try ${fmtN(Math.round((lw + 2.5) * 2) / 2)}`;
    return ex.target;
  }
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
      (e.sets || []).forEach(st => { if (st === current || !st.done) return; const w = +st.weight || 0, r = +st.reps || 0; if (w <= 0) return; const ee = epley(w, r); if (!best || ee > best.e) best = { e: ee, weight: w, reps: r }; });
    }
    return best;
  }
  function persist(day) { const { session } = getSession(store, day); Object.values(session.exercises).forEach(e => { e.completed = (e.sets || []).length > 0 && e.sets.every(s => s.done); }); save(store); }

  function wireDemo(box) {
    if (!box) return;
    box.addEventListener("click", function once() {
      const id = box.dataset.vid;
      box.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      box.removeEventListener("click", once);
    });
  }

  // ---------- rest timer (Date.now anchored, survives backgrounding) ----------
  let restInt = null, restEnd = 0, restRemain = REST_SECONDS, restCb = null;
  const restEl = document.getElementById("rest"), restTime = document.getElementById("rest-time"), restNext = document.getElementById("rest-next");
  function startRest(cb, nextText, seconds) {
    const s = (seconds != null ? seconds : REST_SECONDS);
    restCb = cb || null; restRemain = s; restEnd = Date.now() + s * 1000;
    restNext.textContent = nextText || ""; restEl.hidden = false; paintRest();
    if (restInt) clearInterval(restInt);
    restInt = setInterval(() => { restRemain = Math.ceil((restEnd - Date.now()) / 1000); if (restRemain <= 0) { doneRest(); } else paintRest(); }, 250);
  }
  function paintRest() { const m = Math.floor(Math.max(0, restRemain) / 60), s = Math.max(0, restRemain) % 60; restTime.textContent = `${m}:${String(s).padStart(2, "0")}`; }
  function doneRest() { stopRest(); chime(); buzz([200, 80, 200]); if (restCb) { const cb = restCb; restCb = null; cb(); } }
  function stopRest() { if (restInt) clearInterval(restInt); restInt = null; restEnd = 0; restEl.hidden = true; }
  restEl.querySelectorAll("[data-rest]").forEach(b => b.addEventListener("click", () => { restRemain = Math.max(0, restRemain + parseInt(b.dataset.rest, 10)); restEnd = Date.now() + restRemain * 1000; paintRest(); }));
  document.getElementById("rest-skip").addEventListener("click", () => doneRest());
  document.addEventListener("visibilitychange", () => { if (document.hidden || !restInt) return; restRemain = Math.ceil((restEnd - Date.now()) / 1000); if (restRemain <= 0) doneRest(); else paintRest(); });

  // ---------- audio / haptics ----------
  let actx = null;
  function primeAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} }
  function chime() { try { primeAudio(); const t = actx.currentTime; [[880, 0, .18], [1320, .14, .22]].forEach(([f, o, d]) => { const osc = actx.createOscillator(), g = actx.createGain(); osc.type = "sine"; osc.frequency.value = f; g.gain.setValueAtTime(.0001, t + o); g.gain.exponentialRampToValueAtTime(.16, t + o + .02); g.gain.exponentialRampToValueAtTime(.0001, t + o + d); osc.connect(g).connect(actx.destination); osc.start(t + o); osc.stop(t + o + d + .05); }); } catch (e) {} }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p || 16); } catch (e) {} }

  // ---------- export ----------
  function exportData() {
    const txt = JSON.stringify(store);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => alert("Training data copied to clipboard. Paste it somewhere safe.")).catch(() => prompt("Copy your data:", txt));
    else prompt("Copy your data:", txt);
  }
  function importData() {
    const raw = prompt("Paste a backup to restore. This replaces everything currently saved.");
    if (!raw) return;
    try { const obj = JSON.parse(raw); if (!obj || typeof obj !== "object" || !("sessions" in obj)) throw new Error("bad"); store = obj; store.sessions = store.sessions || {}; save(store); view = { name: "home" }; render(); alert("Restored."); }
    catch (e) { alert("That doesn't look like a valid backup."); }
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
  function weekLbl(d) { return new Date(d).toLocaleDateString(undefined, { day: "numeric" }); }

  // ---------- tabs ----------
  tabbar.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab;
    if (t === "train") { const day = currentDay(); startSessionSoft(day); }
    else { view = { name: "home" }; render(); }
  }));
  function startSessionSoft(day) { getSession(store, day); if (!store.current) store.current = dateKey(day); save(store); view = { name: "train", day }; render(); }

  // ---------- boot ----------
  history.replaceState({ v: "home" }, "");
  if (!store.onboarded && Object.keys(store.sessions || {}).length === 0) renderOnboard(); else render();
  try {
    if (store.remind && "Notification" in window && Notification.permission === "granted" && isTrainingDay() && !trainedToday()) {
      new Notification("Training day", { body: "You, Faisal and Yazan. Let's go." });
    }
  } catch (e) {}
})();
