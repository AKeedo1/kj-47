/* =====================================================
   THE PATH — Training PWA
   Logic: state, day routing, set logger, rest timer, swaps
   ===================================================== */

(() => {
  const REST_DEFAULT_SECONDS = 120;
  const STORAGE_KEY = "thepath.training.v1";

  // ---- State ----
  const todayDayKey = () => {
    // Mon=1, Wed=3, Sat=6 — auto-detect; otherwise pick nearest scheduled day
    const dow = new Date().getDay(); // 0=Sun ... 6=Sat
    if (dow === 1) return "monday";
    if (dow === 3) return "wednesday";
    if (dow === 6) return "saturday";
    // off-day: show next session
    if (dow === 0) return "monday";          // Sun -> Mon
    if (dow === 2) return "wednesday";       // Tue -> Wed
    if (dow === 4 || dow === 5) return "saturday"; // Thu/Fri -> Sat
    return "monday";
  };

  const sessionDateKey = (day) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}__${day}`;
  };

  const loadStore = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { sessions: {}, history: {} };
    } catch (e) {
      return { sessions: {}, history: {} };
    }
  };
  const saveStore = (store) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
  };

  const getSession = (day) => {
    const store = loadStore();
    const key = sessionDateKey(day);
    if (!store.sessions[key]) {
      store.sessions[key] = {
        day,
        date: new Date().toISOString(),
        feel: null,
        exercises: {},
        note: ""
      };
      saveStore(store);
    }
    return { store, key, session: store.sessions[key] };
  };

  const setSession = (key, session) => {
    const store = loadStore();
    store.sessions[key] = session;
    saveStore(store);
  };

  const lastLogFor = (exerciseId) => {
    const store = loadStore();
    const arr = store.history[exerciseId];
    if (!arr || arr.length === 0) return null;
    return arr[arr.length - 1];
  };

  const recordHistory = (exerciseId, sets) => {
    const store = loadStore();
    if (!store.history[exerciseId]) store.history[exerciseId] = [];
    const performed = sets.filter(s => s.done && (s.weight || s.reps));
    if (performed.length === 0) return;
    const top = performed.reduce((a, b) =>
      (Number(b.weight) || 0) >= (Number(a.weight) || 0) ? b : a
    );
    store.history[exerciseId].push({
      date: new Date().toISOString(),
      topWeight: top.weight,
      topReps: top.reps,
      sets: performed.length
    });
    if (store.history[exerciseId].length > 20) {
      store.history[exerciseId] = store.history[exerciseId].slice(-20);
    }
    saveStore(store);
  };

  // ---- Routing / view state ----
  let currentDay = todayDayKey();
  let currentView = "session";    // session | exercise | finish
  let currentExerciseIdx = 0;

  // ---- Rest timer (Date.now-anchored, survives backgrounding) ----
  let restInterval = null;
  let restEndAt = 0;
  let restRemaining = REST_DEFAULT_SECONDS;

  const startRest = (seconds = REST_DEFAULT_SECONDS) => {
    restRemaining = seconds;
    restEndAt = Date.now() + seconds * 1000;
    document.getElementById("rest-timer").classList.add("is-open");
    updateRestDisplay();
    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(() => {
      restRemaining = Math.ceil((restEndAt - Date.now()) / 1000);
      if (restRemaining <= 0) {
        stopRest();
        playChime();
        try { navigator.vibrate?.([300, 80, 300]); } catch (e) {}
        return;
      }
      updateRestDisplay();
    }, 250);
  };
  const stopRest = () => {
    if (restInterval) clearInterval(restInterval);
    restInterval = null;
    restEndAt = 0;
    document.getElementById("rest-timer").classList.remove("is-open");
  };
  const updateRestDisplay = () => {
    const m = Math.floor(Math.max(0, restRemaining) / 60);
    const s = Math.max(0, restRemaining) % 60;
    document.getElementById("rest-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
  };

  // ---- Audio chime (WebAudio, no asset dependency) ----
  let audioCtx = null;
  const playChime = () => {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      // two-tone soft chime
      [
        { f: 880, t: 0,    d: 0.18 },
        { f: 1320, t: 0.14, d: 0.22 }
      ].forEach(({ f, t, d }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.18, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + t);
        osc.stop(now + t + d + 0.05);
      });
    } catch (e) { /* iOS may block until first user gesture; silent fail is fine */ }
  };

  // Recompute timers on visibility change (returning from background)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (restInterval && restEndAt) {
      restRemaining = Math.ceil((restEndAt - Date.now()) / 1000);
      if (restRemaining <= 0) {
        stopRest();
        playChime();
      } else {
        updateRestDisplay();
      }
    }
    if (guided.active && guided.restInterval && guided.restEndAt) {
      guided.restRemaining = Math.ceil((guided.restEndAt - Date.now()) / 1000);
      if (guided.restRemaining <= 0) {
        clearInterval(guided.restInterval);
        guided.restInterval = null;
        playChime();
        // determine between-exercise vs between-set the same way as guidedSkipRest
        const day = PROGRAM[currentDay];
        const ex = day.exercises[guided.exIdx];
        const between = guided.setIdx === 0 && (function() {
          const { session } = getSession(currentDay);
          const exId = effectiveExerciseId(session, guided.exIdx);
          const exState = session.exercises[exId];
          return !exState || !exState.sets || !exState.sets[0] || !exState.sets[0].done;
        })();
        guidedRestComplete(between);
      } else {
        guidedUpdateRestDisplay();
      }
    }
  });

  // ---- Helpers (effective-id, date, modifiers) ----
  const DAY_LABELS = { monday: "Monday", wednesday: "Wednesday", saturday: "Saturday" };

  const effectiveExerciseId = (session, idx) => {
    if (session && session.swaps && session.swaps[idx]) return session.swaps[idx];
    const day = PROGRAM[currentDay];
    return day.exercises[idx].id;
  };

  const formatDateLine = () => {
    const d = new Date();
    const today = todayDayKey();
    const todayLabel = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const dow = d.getDay();
    const isProgramDay = dow === 1 || dow === 3 || dow === 6;
    if (currentDay === today && isProgramDay) {
      return todayLabel;
    }
    const previewName = DAY_LABELS[currentDay] || currentDay;
    const shortToday = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return `${shortToday} · previewing ${previewName.toLowerCase()}'s session`;
  };

  const feelModifier = (session) => {
    if (!session || !session.feel) return 1.0;
    const opt = FEEL_OPTIONS.find(o => o.id === session.feel);
    return opt ? opt.loadModifier : 1.0;
  };

  const adjustedTarget = (ex, idx, session) => {
    const mod = feelModifier(session);
    const exId = effectiveExerciseId(session, idx);
    const last = lastLogFor(exId);
    const lastWeight = last && last.topWeight ? parseFloat(last.topWeight) : null;
    if (lastWeight && mod < 1.0) {
      const suggested = Math.max(0, Math.round((lastWeight * mod) * 2) / 2);
      return `Suggested today: ${suggested} kg · down ${Math.round((1 - mod) * 100)}% (feel)`;
    }
    if (lastWeight && mod === 1.0) {
      // Progressive overload nudge: if last session was logged, try +2.5 kg
      const tryNext = Math.round((lastWeight + 2.5) * 2) / 2;
      return `Last: ${lastWeight} kg × ${last.topReps || "—"} · try ${tryNext} kg`;
    }
    return ex.target;
  };

  // ---- Program week / session counter ----
  const PROGRAM_DAYS_PER_WEEK = 3;
  const PROGRAM_WEEKS = 6;
  const getProgramStartDate = () => {
    const store = loadStore();
    return store.programStartDate || null;
  };
  const setProgramStartDate = () => {
    const store = loadStore();
    if (!store.programStartDate) {
      store.programStartDate = new Date().toISOString();
      saveStore(store);
    }
  };
  const getWeekOfProgram = () => {
    const start = getProgramStartDate();
    if (!start) return null;
    const startMs = new Date(start).getTime();
    const days = Math.floor((Date.now() - startMs) / 86400000);
    const week = Math.min(PROGRAM_WEEKS, Math.max(1, Math.floor(days / 7) + 1));
    return week;
  };
  const getSessionNumber = () => {
    const store = loadStore();
    const sessions = store.sessions || {};
    // count sessions where at least one set was completed
    let n = 0;
    Object.values(sessions).forEach(s => {
      const anyDone = Object.values(s.exercises || {}).some(ex => (ex.sets || []).some(set => set.done));
      if (anyDone) n++;
    });
    return n;
  };
  const renderWeekCounter = () => {
    const el = document.getElementById("session-week");
    if (!el) return;
    const week = getWeekOfProgram();
    if (!week) { el.textContent = ""; return; }
    const sessNum = getSessionNumber();
    const totalSessions = PROGRAM_DAYS_PER_WEEK * PROGRAM_WEEKS;
    el.textContent = `Week ${week} of ${PROGRAM_WEEKS} · session ${Math.max(1, sessNum)} of ${totalSessions}`;
  };

  // ---- First-run onboarding ----
  const maybeShowOnboarding = () => {
    const store = loadStore();
    if (store.onboarded) return;
    const onb = document.getElementById("onboard");
    if (!onb) return;
    onb.hidden = false;
    document.getElementById("onboard-go").addEventListener("click", () => {
      const s = loadStore();
      s.onboarded = true;
      if (!s.programStartDate) s.programStartDate = new Date().toISOString();
      saveStore(s);
      onb.hidden = true;
      renderWeekCounter();
    }, { once: true });
  };

  const renderTopbarDays = () => {
    const today = todayDayKey();
    document.querySelectorAll(".day-pill").forEach(btn => {
      const day = btn.dataset.day;
      btn.classList.toggle("is-active", day === currentDay && currentView === "session");
      btn.classList.toggle("is-today", day === today);
    });
  };

  const renderProgress = () => {
    const { session } = getSession(currentDay);
    const day = PROGRAM[currentDay];
    const total = day.exercises.length;
    let done = 0;
    for (let i = 0; i < total; i++) {
      const exId = effectiveExerciseId(session, i);
      const s = session.exercises[exId];
      if (s && s.completed) done++;
    }
    const pct = total ? (done / total) * 100 : 0;
    document.querySelector(".topbar__progress-fill").style.width = `${pct}%`;
    const counter = document.getElementById("exercise-count");
    if (counter) counter.textContent = `${done} of ${total} done`;
  };

  const renderSession = () => {
    const day = PROGRAM[currentDay];
    const { session } = getSession(currentDay);

    document.getElementById("session-date").textContent = formatDateLine();
    document.getElementById("session-title").textContent = day.title;
    document.getElementById("session-sub").textContent = day.subtitle;
    document.getElementById("warmup-body").textContent = day.warmup;
    renderWeekCounter();

    // feel
    const feelOptions = document.getElementById("feel-options");
    feelOptions.innerHTML = "";
    FEEL_OPTIONS.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "feel-option" + (session.feel === opt.id ? " is-selected" : "");
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        const { key, session: sess } = getSession(currentDay);
        sess.feel = sess.feel === opt.id ? null : opt.id;
        setSession(key, sess);
        renderSession();
      });
      feelOptions.appendChild(btn);
    });
    const feelNote = document.getElementById("feel-note");
    const selected = FEEL_OPTIONS.find(o => o.id === session.feel);
    feelNote.textContent = selected ? selected.note : "";

    // exercise list
    const list = document.getElementById("exercise-list");
    list.innerHTML = "";
    day.exercises.forEach((ex, i) => {
      const exId = effectiveExerciseId(session, i);
      const lib = EXERCISE_LIBRARY[exId];
      if (!lib) return;
      const exState = session.exercises[exId] || {};
      const wasSwapped = exId !== ex.id;
      const li = document.createElement("li");
      const card = document.createElement("button");
      card.className = "exercise-card" + (exState.completed ? " is-done" : "");
      card.innerHTML = `
        <span class="exercise-card__num">${String(i + 1).padStart(2, "0")}</span>
        <span class="exercise-card__body">
          <span class="exercise-card__name">${lib.name}${wasSwapped ? ' <em class="exercise-card__swap">· swapped</em>' : ""}</span>
          <span class="exercise-card__meta">${ex.sets} × ${ex.reps}</span>
        </span>
        <span class="exercise-card__chev">›</span>
      `;
      card.addEventListener("click", () => openExercise(i));
      li.appendChild(card);
      list.appendChild(li);
    });

    renderProgress();
    renderTopbarDays();
  };

  const openExercise = (idx) => {
    currentView = "exercise";
    currentExerciseIdx = idx;
    document.getElementById("view-session").hidden = true;
    document.getElementById("view-exercise").hidden = false;
    document.getElementById("view-finish").hidden = true;
    renderExercise();
    window.scrollTo(0, 0);
  };

  const closeExercise = () => {
    currentView = "session";
    document.getElementById("view-session").hidden = false;
    document.getElementById("view-exercise").hidden = true;
    document.getElementById("view-finish").hidden = true;
    // tear down iframe to stop video
    document.getElementById("ex-video-frame").innerHTML = "";
    renderSession();
    window.scrollTo(0, 0);
  };

  const buildSwapPills = (exerciseId) => {
    const lib = EXERCISE_LIBRARY[exerciseId];
    const container = document.getElementById("swaps-list");
    container.innerHTML = "";
    const day = PROGRAM[currentDay];
    const originalId = day.exercises[currentExerciseIdx].id;
    const isSwapped = exerciseId !== originalId;

    const candidates = (lib.swaps || []).filter(id => EXERCISE_LIBRARY[id] && id !== exerciseId);
    // if currently swapped, ensure original is offered as a "revert"
    if (isSwapped && !candidates.includes(originalId) && EXERCISE_LIBRARY[originalId]) {
      candidates.unshift(originalId);
    }

    if (candidates.length === 0) {
      document.getElementById("swaps-section").hidden = true;
      return;
    }
    document.getElementById("swaps-section").hidden = false;

    candidates.forEach(swapId => {
      const swap = EXERCISE_LIBRARY[swapId];
      const pill = document.createElement("button");
      pill.className = "swap-pill" + (swapId === originalId && isSwapped ? " swap-pill--revert" : "");
      pill.textContent = swapId === originalId && isSwapped ? `↶ Revert to ${swap.name}` : swap.name;
      pill.addEventListener("click", () => {
        const { key, session } = getSession(currentDay);
        session.swaps = session.swaps || {};

        // Migrate any logged sets from the current exercise to the new one
        const currentData = session.exercises[exerciseId];
        if (currentData) {
          const target = session.exercises[swapId] || {};
          // Preserve existing target data if present (e.g. user had logged on the swap before reverting)
          if (!target.sets || target.sets.length === 0) {
            session.exercises[swapId] = currentData;
          }
          delete session.exercises[exerciseId];
        }

        // Record swap or clear it (if reverting to original)
        if (swapId === originalId) {
          delete session.swaps[currentExerciseIdx];
        } else {
          session.swaps[currentExerciseIdx] = swapId;
        }

        setSession(key, session);
        renderExercise();
      });
      container.appendChild(pill);
    });
  };

  const renderExercise = () => {
    const day = PROGRAM[currentDay];
    const ex = day.exercises[currentExerciseIdx];
    const { session } = getSession(currentDay);
    const exId = effectiveExerciseId(session, currentExerciseIdx);
    const lib = EXERCISE_LIBRARY[exId];
    if (!lib) return;
    const exState = session.exercises[exId] || { sets: [], completed: false };
    const isSwapped = exId !== ex.id;

    document.getElementById("ex-index").textContent = `Exercise ${currentExerciseIdx + 1} of ${day.exercises.length}${isSwapped ? " · swapped" : ""}`;
    document.getElementById("ex-title").textContent = lib.name;
    document.getElementById("ex-cue").textContent = lib.cue;
    document.getElementById("ex-target-value").textContent = `${ex.sets} × ${ex.reps} — ${adjustedTarget(ex, currentExerciseIdx, session)}`;

    const last = lastLogFor(exId);
    document.getElementById("ex-last-value").textContent =
      last ? `${last.topWeight || "—"} kg × ${last.topReps || "—"}` : "First time — log honestly.";

    // video
    const frame = document.getElementById("ex-video-frame");
    frame.innerHTML = `<iframe loading="lazy" src="https://www.youtube.com/embed/${lib.video}?rel=0&modestbranding=1&mute=1&playsinline=1" title="${lib.name}" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    document.getElementById("ex-video-caption").textContent = lib.videoTitle;

    // logger
    const setsContainer = document.getElementById("logger-sets");
    setsContainer.innerHTML = "";

    // ensure sets array exists
    if (!exState.sets || exState.sets.length !== ex.sets) {
      exState.sets = Array.from({ length: ex.sets }, (_, i) => ({
        weight: exState.sets?.[i]?.weight || "",
        reps: exState.sets?.[i]?.reps || "",
        done: !!exState.sets?.[i]?.done
      }));
      const { key } = getSession(currentDay);
      session.exercises[exId] = exState;
      setSession(key, session);
    }

    exState.sets.forEach((set, i) => {
      const row = document.createElement("div");
      row.className = "set-row" + (set.done ? " is-done" : "");
      row.innerHTML = `
        <span class="set-row__num">Set ${i + 1}</span>
        <span class="set-input">
          <button class="set-input__btn" data-step="-2.5" aria-label="Decrease weight">−</button>
          <input class="set-input__field" type="number" inputmode="decimal" step="2.5" placeholder="kg" value="${set.weight}" data-field="weight" />
          <span class="set-input__suffix">kg</span>
          <button class="set-input__btn" data-step="2.5" aria-label="Increase weight">+</button>
        </span>
        <span class="set-input">
          <button class="set-input__btn" data-rstep="-1" aria-label="Decrease reps">−</button>
          <input class="set-input__field" type="number" inputmode="numeric" step="1" placeholder="reps" value="${set.reps}" data-field="reps" />
          <span class="set-input__suffix">rep</span>
          <button class="set-input__btn" data-rstep="1" aria-label="Increase reps">+</button>
        </span>
        <button class="set-row__log" aria-label="Log set">${set.done ? "✓" : "Log"}</button>
      `;

      // weight steppers
      row.querySelectorAll("[data-step]").forEach(b => {
        b.addEventListener("click", () => {
          const inp = row.querySelector('input[data-field="weight"]');
          const cur = parseFloat(inp.value) || 0;
          const next = Math.max(0, cur + parseFloat(b.dataset.step));
          inp.value = next % 1 === 0 ? next : next.toFixed(1);
          set.weight = inp.value;
          persistSet(exId, exState);
        });
      });
      // reps steppers
      row.querySelectorAll("[data-rstep]").forEach(b => {
        b.addEventListener("click", () => {
          const inp = row.querySelector('input[data-field="reps"]');
          const cur = parseInt(inp.value, 10) || 0;
          const next = Math.max(0, cur + parseInt(b.dataset.rstep, 10));
          inp.value = next;
          set.reps = String(next);
          persistSet(exId, exState);
        });
      });
      // direct edits
      row.querySelectorAll("input[data-field]").forEach(inp => {
        inp.addEventListener("input", () => {
          set[inp.dataset.field] = inp.value;
          persistSet(exId, exState);
        });
      });
      // log
      row.querySelector(".set-row__log").addEventListener("click", () => {
        set.done = !set.done;
        persistSet(exId, exState);
        renderExercise();
        if (set.done) startRest(REST_DEFAULT_SECONDS);
      });

      setsContainer.appendChild(row);
    });

    buildSwapPills(exId);
    renderFeedback(exId, exState, session);

    document.getElementById("ex-mark-done").textContent = exState.completed ? "Mark incomplete" : "Done";
  };

  // ---- Per-exercise feedback ----
  const lastFeedbackFor = (exerciseId) => {
    // Walk session history backwards for any saved feedback under this exId
    const store = loadStore();
    const keys = Object.keys(store.sessions || {}).sort().reverse();
    for (const k of keys) {
      const s = store.sessions[k];
      const fb = s?.exercises?.[exerciseId]?.feedback;
      if (fb && ((fb.chips && fb.chips.length) || (fb.note && fb.note.trim()))) {
        return { feedback: fb, sessionDate: s.date };
      }
    }
    return null;
  };

  const renderFeedback = (exId, exState, session) => {
    if (!exState.feedback) exState.feedback = { chips: [], note: "" };
    const feelBox = document.getElementById("feedback-chips-feel");
    const fricBox = document.getElementById("feedback-chips-friction");
    feelBox.innerHTML = "";
    fricBox.innerHTML = "";

    FEEDBACK_CHIPS.forEach(chip => {
      const btn = document.createElement("button");
      const selected = exState.feedback.chips.includes(chip.id);
      btn.className = "feedback-chip" + (selected ? ` is-selected feedback-chip--${chip.cat}` : "");
      btn.textContent = chip.label;
      btn.addEventListener("click", () => {
        const idx = exState.feedback.chips.indexOf(chip.id);
        if (idx >= 0) exState.feedback.chips.splice(idx, 1);
        else exState.feedback.chips.push(chip.id);
        const { key } = getSession(currentDay);
        session.exercises[exId] = exState;
        setSession(key, session);
        renderFeedback(exId, exState, session);
      });
      (chip.cat === "feel" ? feelBox : fricBox).appendChild(btn);
    });

    const noteEl = document.getElementById("feedback-note");
    noteEl.value = exState.feedback.note || "";
    // Replace listener to avoid double-binding on re-render
    noteEl.oninput = () => {
      exState.feedback.note = noteEl.value;
      const { key } = getSession(currentDay);
      session.exercises[exId] = exState;
      setSession(key, session);
    };

    // Surface previous feedback (excluding the current session)
    const lastEl = document.getElementById("feedback-last");
    const todayKey = sessionDateKey(currentDay);
    const last = lastFeedbackFor(exId);
    if (last && new Date(last.sessionDate).toISOString() !== new Date(session.date).toISOString()) {
      const chipLabels = (last.feedback.chips || [])
        .map(id => FEEDBACK_CHIPS.find(c => c.id === id)?.label)
        .filter(Boolean)
        .join(" · ");
      const note = last.feedback.note?.trim();
      const when = new Date(last.sessionDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      let text = `Last time (${when}): `;
      text += chipLabels || "no chips";
      if (note) text += ` — "${note}"`;
      lastEl.textContent = text;
    } else {
      lastEl.textContent = "";
    }
  };

  const persistSet = (exerciseId, exState) => {
    const { key, session } = getSession(currentDay);
    // if all sets done, mark exercise completed
    exState.completed = exState.sets.every(s => s.done);
    session.exercises[exerciseId] = exState;
    setSession(key, session);
  };

  const renderFinish = () => {
    document.getElementById("view-session").hidden = true;
    document.getElementById("view-exercise").hidden = true;
    document.getElementById("view-finish").hidden = false;
    document.getElementById("ex-video-frame").innerHTML = "";
    currentView = "finish";

    const day = PROGRAM[currentDay];
    const { session } = getSession(currentDay);
    const total = day.exercises.length;
    let done = 0;
    for (let i = 0; i < total; i++) {
      const exId = effectiveExerciseId(session, i);
      if (session.exercises[exId]?.completed) done++;
    }
    document.getElementById("finish-date").textContent = formatDateLine();
    let subText;
    if (done === 0) {
      subText = "Walked in. That counts as a rep against the resistance. Log next time.";
    } else if (done === total) {
      subText = `${done} of ${total} done. That's the work.`;
    } else {
      subText = `${done} of ${total} done. Partial counts. Log it and rest.`;
    }
    document.getElementById("finish-sub").textContent = subText;
    document.getElementById("finish-note").value = session.note || "";
    window.scrollTo(0, 0);
  };

  // ============================================================
  // GUIDED SESSION MODE — single button → walks you through the lift
  // ============================================================
  const guided = {
    active: false,
    paused: false,
    state: "active",     // 'active' | 'rest' | 'transition' | 'paused'
    exIdx: 0,
    setIdx: 0,
    restRemaining: 0,
    restEndAt: 0,
    restInterval: null,
    pausedFromState: null,
  };

  const guidedShow = (which) => {
    ["active", "rest", "transition", "paused"].forEach(s => {
      document.getElementById(`guided-${s}`).hidden = (s !== which);
    });
    guided.state = which;
  };

  const guidedHideAllSubviews = () => {
    document.getElementById("view-session").hidden = true;
    document.getElementById("view-exercise").hidden = true;
    document.getElementById("view-finish").hidden = true;
    document.getElementById("view-guided").hidden = false;
    document.getElementById("ex-video-frame").innerHTML = "";
  };

  const guidedExitToSession = (toFinish = false) => {
    if (guided.restInterval) { clearInterval(guided.restInterval); guided.restInterval = null; }
    document.getElementById("guided-video-frame").innerHTML = "";
    document.getElementById("guided-video-wrap").hidden = true;
    guided.active = false;
    guided.paused = false;
    document.getElementById("view-guided").hidden = true;
    if (toFinish) {
      renderFinish();
    } else {
      currentView = "session";
      document.getElementById("view-session").hidden = false;
      renderSession();
    }
  };

  const guidedUpdateProgress = () => {
    const day = PROGRAM[currentDay];
    const total = day.exercises.length;
    const fraction = (guided.exIdx + (guided.state === "transition" ? 0 : (guided.setIdx / Math.max(1, day.exercises[guided.exIdx]?.sets || 1)))) / total;
    document.getElementById("guided-progress-fill").style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  };

  const guidedRenderActive = () => {
    const day = PROGRAM[currentDay];
    if (guided.exIdx >= day.exercises.length) { return guidedFinishAll(); }
    const ex = day.exercises[guided.exIdx];
    const { session } = getSession(currentDay);
    const exId = (session.swaps && session.swaps[guided.exIdx]) || ex.id;
    const lib = EXERCISE_LIBRARY[exId];
    if (!lib) { guided.exIdx += 1; guided.setIdx = 0; return guidedRenderActive(); }

    // ensure session set state
    let exState = session.exercises[exId];
    if (!exState || !exState.sets || exState.sets.length !== ex.sets) {
      exState = exState || { sets: [], completed: false };
      exState.sets = Array.from({ length: ex.sets }, (_, i) => ({
        weight: exState.sets?.[i]?.weight || "",
        reps: exState.sets?.[i]?.reps || "",
        done: !!exState.sets?.[i]?.done
      }));
      const { key } = getSession(currentDay);
      session.exercises[exId] = exState;
      setSession(key, session);
    }

    // skip ahead through any already-completed sets
    while (guided.setIdx < exState.sets.length && exState.sets[guided.setIdx].done) {
      guided.setIdx += 1;
    }
    if (guided.setIdx >= exState.sets.length) {
      // exercise done — go to transition for the next one
      return guidedAdvanceToNextExercise(false);
    }

    const set = exState.sets[guided.setIdx];

    document.getElementById("guided-step").textContent = `Exercise ${guided.exIdx + 1} of ${day.exercises.length}`;
    document.getElementById("guided-title").textContent = lib.name;
    document.getElementById("guided-cue").textContent = lib.cue;
    document.getElementById("guided-set-label").textContent = `Set ${guided.setIdx + 1} of ${ex.sets}`;
    document.getElementById("guided-hint").textContent = `${ex.reps} · ${adjustedTarget(ex, guided.exIdx, session)}`;

    const wInput = document.getElementById("guided-weight");
    const rInput = document.getElementById("guided-reps");
    // pre-fill: previous set in this session, or last log
    const last = lastLogFor(exId);
    const prevSetWeight = guided.setIdx > 0 ? exState.sets[guided.setIdx - 1].weight : "";
    const prevSetReps = guided.setIdx > 0 ? exState.sets[guided.setIdx - 1].reps : "";
    wInput.value = set.weight || prevSetWeight || (last?.topWeight ?? "");
    rInput.value = set.reps || prevSetReps || ex.reps.match(/^\d+/)?.[0] || "";

    // load video into collapsible
    document.getElementById("guided-video-frame").innerHTML = "";
    document.getElementById("guided-video-wrap").hidden = true;
    guided._currentVideoId = lib.video;

    guidedShow("active");
    guidedUpdateProgress();
  };

  const guidedLogCurrentSet = () => {
    const day = PROGRAM[currentDay];
    const ex = day.exercises[guided.exIdx];
    const { key, session } = getSession(currentDay);
    const exId = (session.swaps && session.swaps[guided.exIdx]) || ex.id;
    const exState = session.exercises[exId];
    if (!exState) return;
    const wInput = document.getElementById("guided-weight");
    const rInput = document.getElementById("guided-reps");
    exState.sets[guided.setIdx].weight = wInput.value;
    exState.sets[guided.setIdx].reps = rInput.value;
    exState.sets[guided.setIdx].done = true;
    exState.completed = exState.sets.every(s => s.done);
    session.exercises[exId] = exState;
    setSession(key, session);

    const isLastSetOfEx = guided.setIdx >= ex.sets - 1;
    const isLastEx = guided.exIdx >= day.exercises.length - 1;

    if (isLastSetOfEx && isLastEx) {
      // Done with everything — auto-finish
      guidedFinishAll();
      return;
    }
    if (isLastSetOfEx) {
      guidedAdvanceToNextExercise(true);
      return;
    }
    // Normal between-set rest
    guided.setIdx += 1;
    guidedStartRest(REST_DEFAULT_SECONDS, /*betweenExercises*/ false);
  };

  const guidedAdvanceToNextExercise = (afterLog) => {
    const day = PROGRAM[currentDay];
    guided.exIdx += 1;
    guided.setIdx = 0;
    if (guided.exIdx >= day.exercises.length) { return guidedFinishAll(); }
    if (afterLog) {
      guidedStartRest(REST_DEFAULT_SECONDS + 30, /*betweenExercises*/ true);
    } else {
      guidedRenderTransition();
    }
  };

  const guidedRenderTransition = () => {
    const day = PROGRAM[currentDay];
    if (guided.exIdx >= day.exercises.length) { return guidedFinishAll(); }
    const ex = day.exercises[guided.exIdx];
    const { session } = getSession(currentDay);
    const exId = (session.swaps && session.swaps[guided.exIdx]) || ex.id;
    const lib = EXERCISE_LIBRARY[exId];
    if (!lib) { guided.exIdx += 1; return guidedRenderTransition(); }

    const prev = guided.exIdx > 0 ? day.exercises[guided.exIdx - 1] : null;
    const prevId = prev && ((session.swaps && session.swaps[guided.exIdx - 1]) || prev.id);
    const prevLib = prevId && EXERCISE_LIBRARY[prevId];
    document.getElementById("guided-trans-prev").textContent = prevLib ? `✓ ${prevLib.name} complete` : "Ready when you are";
    document.getElementById("guided-trans-title").textContent = lib.name;
    document.getElementById("guided-trans-cue").textContent = lib.cue;
    document.getElementById("guided-trans-meta").textContent = `${ex.sets} × ${ex.reps} · ${ex.target}`;
    guidedShow("transition");
    guidedUpdateProgress();
  };

  const guidedStartRest = (seconds, betweenExercises) => {
    guided.restRemaining = seconds;
    guided.restEndAt = Date.now() + seconds * 1000;
    const day = PROGRAM[currentDay];
    const { session } = getSession(currentDay);
    let nextLabel;
    if (betweenExercises) {
      const nextEx = day.exercises[guided.exIdx];
      const nextId = nextEx && effectiveExerciseId(session, guided.exIdx);
      const nextLib = nextId && EXERCISE_LIBRARY[nextId];
      nextLabel = nextLib ? `Next: ${nextLib.name}` : "Up next";
    } else {
      const ex = day.exercises[guided.exIdx];
      nextLabel = `Next: Set ${guided.setIdx + 1} of ${ex.sets}`;
    }
    document.getElementById("guided-rest-next").textContent = nextLabel;
    // Surface a Marcus cue for the current/next exercise during rest
    const cueEl = document.getElementById("guided-rest-cue");
    if (cueEl) {
      const ex = day.exercises[guided.exIdx];
      const exId = ex && effectiveExerciseId(session, guided.exIdx);
      const lib = exId && EXERCISE_LIBRARY[exId];
      cueEl.textContent = lib ? lib.cue : "";
    }
    guidedUpdateRestDisplay();
    guidedShow("rest");
    guidedUpdateProgress();
    if (guided.restInterval) clearInterval(guided.restInterval);
    guided.restInterval = setInterval(() => {
      if (guided.paused) return;
      guided.restRemaining = Math.ceil((guided.restEndAt - Date.now()) / 1000);
      if (guided.restRemaining <= 0) {
        clearInterval(guided.restInterval);
        guided.restInterval = null;
        guided.restEndAt = 0;
        playChime();
        try { navigator.vibrate?.([200, 100, 200]); } catch (e) {}
        guidedRestComplete(betweenExercises);
        return;
      }
      guidedUpdateRestDisplay();
    }, 250);
  };
  const guidedUpdateRestDisplay = () => {
    const m = Math.floor(Math.max(0, guided.restRemaining) / 60);
    const s = Math.max(0, guided.restRemaining) % 60;
    document.getElementById("guided-rest-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
  };
  const guidedSkipRest = () => {
    if (guided.restInterval) { clearInterval(guided.restInterval); guided.restInterval = null; }
    // determine if it was between-exercises by checking whether setIdx is 0 + exIdx not the same as last active
    // simplest: peek at next state — between-exercises if setIdx === 0 and we're moving to a new exercise
    const day = PROGRAM[currentDay];
    const ex = day.exercises[guided.exIdx];
    const between = guided.setIdx === 0 && (!ex || (function() {
      const { session } = getSession(currentDay);
      const exId = (session.swaps && session.swaps[guided.exIdx]) || ex.id;
      const exState = session.exercises[exId];
      return !exState || !exState.sets || !exState.sets[0] || !exState.sets[0].done;
    })());
    guidedRestComplete(between);
  };
  const guidedRestComplete = (betweenExercises) => {
    if (betweenExercises) {
      guidedRenderTransition();
    } else {
      guidedRenderActive();
    }
  };

  const guidedFinishAll = () => {
    // Persist current stepper state to the active set before exit
    guidedFlushSteppers();
    // Record history for everything completed in this session
    const day = PROGRAM[currentDay];
    const { session } = getSession(currentDay);
    day.exercises.forEach((ex, i) => {
      const exId = effectiveExerciseId(session, i);
      const exState = session.exercises[exId];
      if (exState && exState.sets) recordHistory(exId, exState.sets);
    });
    guidedExitToSession(true);
  };

  // Flush current stepper inputs into exState (so pause/resume don't lose them)
  const guidedFlushSteppers = () => {
    if (!guided.active || guided.state !== "active") return;
    const day = PROGRAM[currentDay];
    const ex = day.exercises[guided.exIdx];
    if (!ex) return;
    const { key, session } = getSession(currentDay);
    const exId = effectiveExerciseId(session, guided.exIdx);
    const exState = session.exercises[exId];
    if (!exState || !exState.sets || !exState.sets[guided.setIdx]) return;
    const wInput = document.getElementById("guided-weight");
    const rInput = document.getElementById("guided-reps");
    if (wInput) exState.sets[guided.setIdx].weight = wInput.value;
    if (rInput) exState.sets[guided.setIdx].reps = rInput.value;
    session.exercises[exId] = exState;
    setSession(key, session);
  };

  const guidedSkipExercise = () => {
    const day = PROGRAM[currentDay];
    if (guided.exIdx >= day.exercises.length - 1) {
      return guidedFinishAll();
    }
    guided.exIdx += 1;
    guided.setIdx = 0;
    guidedRenderTransition();
  };

  const guidedPause = () => {
    if (guided.paused) return;
    guidedFlushSteppers();
    guided.paused = true;
    guided.pausedFromState = guided.state;
    // Stop ticking the rest interval; remember remaining seconds so resume picks up
    if (guided.restInterval) {
      clearInterval(guided.restInterval);
      guided.restInterval = null;
    }
    guidedShow("paused");
  };
  const guidedResume = () => {
    const wasState = guided.pausedFromState;
    guided.paused = false;
    guided.pausedFromState = null;
    if (wasState === "rest") {
      // Resume rest with whatever seconds were remaining
      const day = PROGRAM[currentDay];
      const ex = day.exercises[guided.exIdx];
      const { session } = getSession(currentDay);
      const exId = effectiveExerciseId(session, guided.exIdx);
      const exState = session.exercises[exId];
      const between = guided.setIdx === 0 && (!exState || !exState.sets[0] || !exState.sets[0].done);
      guidedStartRest(guided.restRemaining > 0 ? guided.restRemaining : REST_DEFAULT_SECONDS, between);
    } else if (wasState === "transition") {
      guidedRenderTransition();
    } else {
      guidedRenderActive();
    }
  };

  const guidedSwapCurrent = () => {
    // exit guided into normal exercise view to use existing swap UI
    if (guided.restInterval) { clearInterval(guided.restInterval); guided.restInterval = null; }
    guided.active = false;
    document.getElementById("view-guided").hidden = true;
    document.getElementById("guided-video-frame").innerHTML = "";
    currentExerciseIdx = guided.exIdx;
    currentView = "exercise";
    document.getElementById("view-exercise").hidden = false;
    renderExercise();
    window.scrollTo(0, 0);
  };

  const startGuidedSession = () => {
    setProgramStartDate(); // marks day-1 if not already set
    guided.active = true;
    guided.paused = false;
    guided.exIdx = 0;
    guided.setIdx = 0;
    guidedHideAllSubviews();
    // Off-day preview banner
    const today = todayDayKey();
    const dow = new Date().getDay();
    const isProgramDay = dow === 1 || dow === 3 || dow === 6;
    const previewEl = document.getElementById("guided-bar-preview");
    if (previewEl) {
      previewEl.textContent = (currentDay !== today || !isProgramDay)
        ? `Today is a rest day — previewing ${DAY_LABELS[currentDay]}`
        : "";
    }
    // find the first not-yet-completed set
    const day = PROGRAM[currentDay];
    const { session } = getSession(currentDay);
    for (let i = 0; i < day.exercises.length; i++) {
      const exId = (session.swaps && session.swaps[i]) || day.exercises[i].id;
      const exState = session.exercises[exId];
      if (!exState || !exState.completed) {
        guided.exIdx = i;
        const sets = exState?.sets || [];
        const firstUndone = sets.findIndex(s => !s.done);
        guided.setIdx = firstUndone >= 0 ? firstUndone : 0;
        break;
      }
      if (i === day.exercises.length - 1) {
        // everything done — go straight to finish
        return guidedFinishAll();
      }
    }
    guidedRenderActive();
  };

  // ---- Wiring ----
  const wireEvents = () => {
    // day tabs
    document.querySelectorAll(".day-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        if (guided.active) return; // disabled mid-guided session
        currentDay = btn.dataset.day;
        currentView = "session";
        document.getElementById("view-session").hidden = false;
        document.getElementById("view-exercise").hidden = true;
        document.getElementById("view-finish").hidden = true;
        document.getElementById("ex-video-frame").innerHTML = "";
        renderSession();
        window.scrollTo(0, 0);
      });
    });

    // brand also disabled mid-guided
    const brandLink = document.querySelector(".topbar__brand");
    if (brandLink) {
      const orig = brandLink.onclick;
      brandLink.addEventListener("click", (e) => {
        if (guided.active) e.stopImmediatePropagation();
      }, true);
    }

    // brand back-to-home
    document.querySelector(".topbar__brand").addEventListener("click", (e) => {
      e.preventDefault();
      currentDay = todayDayKey();
      currentView = "session";
      document.getElementById("view-session").hidden = false;
      document.getElementById("view-exercise").hidden = true;
      document.getElementById("view-finish").hidden = true;
      document.getElementById("ex-video-frame").innerHTML = "";
      renderSession();
      window.scrollTo(0, 0);
    });

    document.getElementById("back-to-session").addEventListener("click", closeExercise);

    document.getElementById("ex-mark-done").addEventListener("click", () => {
      const { key, session } = getSession(currentDay);
      const exId = effectiveExerciseId(session, currentExerciseIdx);
      const exState = session.exercises[exId] || { sets: [], completed: false };
      exState.completed = !exState.completed;
      if (exState.completed) {
        exState.sets = exState.sets.map(s => ({ ...s, done: true }));
      }
      session.exercises[exId] = exState;
      setSession(key, session);
      closeExercise();
    });

    // Two-tap reset — first tap arms, second tap (within 4s) wipes
    let resetArmed = false;
    let resetArmTimer = null;
    const resetBtn = document.getElementById("reset-session");
    const originalResetText = resetBtn.textContent;
    resetBtn.addEventListener("click", () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = "Tap again to wipe";
        resetBtn.classList.add("btn--accent");
        resetArmTimer = setTimeout(() => {
          resetArmed = false;
          resetBtn.textContent = originalResetText;
          resetBtn.classList.remove("btn--accent");
        }, 4000);
        return;
      }
      // confirmed
      if (resetArmTimer) clearTimeout(resetArmTimer);
      resetArmed = false;
      resetBtn.textContent = originalResetText;
      resetBtn.classList.remove("btn--accent");
      const { key } = getSession(currentDay);
      const store = loadStore();
      delete store.sessions[key];
      saveStore(store);
      renderSession();
    });

    document.getElementById("finish-session").addEventListener("click", renderFinish);

    document.getElementById("finish-back").addEventListener("click", () => {
      currentView = "session";
      document.getElementById("view-session").hidden = false;
      document.getElementById("view-finish").hidden = true;
      renderSession();
    });

    document.getElementById("finish-save").addEventListener("click", () => {
      const { key, session } = getSession(currentDay);
      session.note = document.getElementById("finish-note").value;
      setSession(key, session);
      // record top set per completed exercise to history (use effective id)
      const day = PROGRAM[currentDay];
      day.exercises.forEach((ex, i) => {
        const exId = effectiveExerciseId(session, i);
        const exState = session.exercises[exId];
        if (exState && exState.sets) recordHistory(exId, exState.sets);
      });
      currentView = "session";
      document.getElementById("view-session").hidden = false;
      document.getElementById("view-finish").hidden = true;
      renderSession();
    });

    // rest timer
    document.getElementById("rest-skip").addEventListener("click", stopRest);
    document.querySelectorAll("[data-rest-adjust]").forEach(b => {
      b.addEventListener("click", () => {
        restRemaining = Math.max(0, restRemaining + parseInt(b.dataset.restAdjust, 10));
        updateRestDisplay();
      });
    });

    // ---- Guided session wiring ----
    document.getElementById("start-session").addEventListener("click", startGuidedSession);
    document.getElementById("guided-exit").addEventListener("click", () => {
      if (confirm("Exit guided session? Your logs are saved.")) {
        guidedExitToSession(false);
      }
    });
    document.getElementById("guided-pause").addEventListener("click", guidedPause);
    document.getElementById("guided-resume").addEventListener("click", guidedResume);
    document.getElementById("guided-end-early").addEventListener("click", () => {
      guidedExitToSession(true);
    });

    // weight steppers
    document.querySelectorAll("[data-gstep]").forEach(b => {
      b.addEventListener("click", () => {
        const inp = document.getElementById("guided-weight");
        const cur = parseFloat(inp.value) || 0;
        const next = Math.max(0, cur + parseFloat(b.dataset.gstep));
        inp.value = next % 1 === 0 ? next : next.toFixed(1);
        guidedFlushSteppers();
      });
    });
    document.querySelectorAll("[data-grstep]").forEach(b => {
      b.addEventListener("click", () => {
        const inp = document.getElementById("guided-reps");
        const cur = parseInt(inp.value, 10) || 0;
        const next = Math.max(0, cur + parseInt(b.dataset.grstep, 10));
        inp.value = next;
        guidedFlushSteppers();
      });
    });
    document.getElementById("guided-weight").addEventListener("input", guidedFlushSteppers);
    document.getElementById("guided-reps").addEventListener("input", guidedFlushSteppers);

    document.getElementById("guided-log").addEventListener("click", guidedLogCurrentSet);
    document.getElementById("guided-skip-ex").addEventListener("click", () => {
      if (confirm("Skip this exercise and move to the next?")) guidedSkipExercise();
    });
    document.getElementById("guided-swap").addEventListener("click", guidedSwapCurrent);
    document.getElementById("guided-trans-skip").addEventListener("click", () => {
      if (confirm("Skip this exercise?")) guidedSkipExercise();
    });
    document.getElementById("guided-trans-swap").addEventListener("click", guidedSwapCurrent);
    document.getElementById("guided-trans-go").addEventListener("click", () => {
      guidedRenderActive();
    });

    document.getElementById("guided-rest-skip").addEventListener("click", guidedSkipRest);
    document.querySelectorAll("[data-grest-adjust]").forEach(b => {
      b.addEventListener("click", () => {
        guided.restRemaining = Math.max(0, guided.restRemaining + parseInt(b.dataset.grestAdjust, 10));
        guidedUpdateRestDisplay();
      });
    });

    // collapsible video in guided
    document.getElementById("guided-show-video").addEventListener("click", () => {
      const wrap = document.getElementById("guided-video-wrap");
      const frame = document.getElementById("guided-video-frame");
      if (wrap.hidden) {
        const vid = guided._currentVideoId;
        if (vid) {
          frame.innerHTML = `<iframe loading="lazy" src="https://www.youtube.com/embed/${vid}?rel=0&modestbranding=1&mute=1&playsinline=1" title="demo" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        }
        wrap.hidden = false;
      }
    });
    document.getElementById("guided-hide-video").addEventListener("click", () => {
      document.getElementById("guided-video-wrap").hidden = true;
      document.getElementById("guided-video-frame").innerHTML = "";
    });
  };

  // ---- Boot ----
  document.addEventListener("DOMContentLoaded", () => {
    wireEvents();
    maybeShowOnboarding();
    renderSession();
  });
})();
