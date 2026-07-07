// Marcus's Phase 1 Program — Weeks 1-6
// Loading rule: every set leaves 4 reps in the tank. RPE 6.
// Hard rules: no barbell back squat / deadlift / overhead press in Phase 1.
// Joint pain (sharp, not muscle burn) = stop, swap, log it.
// Library expanded 2026-07-07 for swap coverage across varied gyms (Privilee). Machine/DB/cable-safe;
// barbell bench + row available as swaps; NO barbell back squat. New exercises use a YouTube-search
// video fallback (no fabricated video IDs) — `video: ""` renders a "Search YouTube" button.

const EXERCISE_LIBRARY = {
  // ===== Squat / knee-dominant =====
  goblet_squat: {
    name: "Goblet Squat",
    cue: "Feet just outside hip width, dumbbell at chest. Sit between your hips, not back. Knees track over your middle toes. Drive through the whole foot.",
    video: "t__Um6KjJkc", videoTitle: "PERFECT Goblet Squat Form",
    swaps: ["leg_press", "hack_squat", "leg_extension", "wall_sit"]
  },
  leg_press: {
    name: "Leg Press",
    cue: "Feet shoulder-width on the platform, mid-foot. Lower under control until knees ~90°. Drive through heels — don't lock out at the top.",
    video: "nDh_BlnLCGc", videoTitle: "How To Leg Press With Perfect Technique",
    swaps: ["hack_squat", "goblet_squat", "leg_extension", "wall_sit"]
  },
  hack_squat: {
    name: "Hack Squat",
    cue: "Shoulders under the pads, feet mid-platform. Lower under control to about 90°, drive through the whole foot. Don't let the knees cave in.",
    video: "", videoTitle: "",
    swaps: ["leg_press", "goblet_squat", "leg_extension"]
  },
  leg_extension: {
    name: "Leg Extension",
    cue: "Back into the seat, pad on the lower shins. Straighten the knees, squeeze at the top, lower slow. Stop short of any knee pinch.",
    video: "", videoTitle: "",
    swaps: ["leg_press", "hack_squat", "goblet_squat"]
  },
  wall_sit: {
    name: "Wall Sit",
    cue: "Back flat against wall. Slide down until thighs are parallel to floor — knees at 90°. Hold. Drive knees out, not in. 30 sec to start.",
    video: "jHOVjaDqj-M", videoTitle: "Beginner Wall Sit Exercises",
    swaps: ["goblet_squat", "leg_press", "hack_squat"]
  },

  // ===== Hinge / hip-dominant =====
  db_rdl: {
    name: "Romanian Deadlift (Dumbbells)",
    cue: "Light weight — this is form work, not strength. Knees soft, push hips BACK toward the wall behind you. Dumbbells slide along the front of your legs. Stop at mid-shin or when you feel a hamstring stretch. Back stays flat.",
    video: "hu3jRvTc_po", videoTitle: "The PERFECT Dumbbell Romanian Deadlift",
    swaps: ["seated_leg_curl", "good_morning", "back_extension", "hip_thrust"]
  },
  good_morning: {
    name: "Dumbbell Good Morning",
    cue: "Light weight. Dumbbells across upper back. Knees soft — push hips BACK like you're closing a car door with your butt. Hinge until you feel the hamstrings stretch. Back stays flat.",
    video: "SfljAHC7_DU", videoTitle: "Dumbbell Good Morning",
    swaps: ["db_rdl", "seated_leg_curl", "back_extension"]
  },
  seated_leg_curl: {
    name: "Seated Leg Curl",
    cue: "Thighs pinned under the pad, pad on the lower calf. Curl your heels down and under, squeeze the hamstrings, return slow. No jerking.",
    video: "", videoTitle: "",
    swaps: ["db_rdl", "good_morning", "back_extension"]
  },
  back_extension: {
    name: "Back Extension",
    cue: "Hips on the pad, feet locked. Round down slowly, then squeeze the glutes to come up to a straight line — don't hyperextend past flat.",
    video: "", videoTitle: "",
    swaps: ["db_rdl", "good_morning", "seated_leg_curl"]
  },
  hip_thrust: {
    name: "Hip Thrust",
    cue: "Upper back on the bench, weight over the hips (pad it). Drive through the heels, squeeze the glutes hard at the top, ribs down and chin tucked. Lower under control.",
    video: "", videoTitle: "",
    swaps: ["db_rdl", "good_morning", "back_extension"]
  },

  // ===== Horizontal push =====
  db_bench_press: {
    name: "Dumbbell Chest Press",
    cue: "Flat bench, feet planted. Dumbbells over chest, lower to nipple line. Wrists stacked over elbows. Press up and slightly together.",
    video: "1V3vpcaxRYQ", videoTitle: "Best Dumbbell Bench Press Tutorial",
    swaps: ["incline_db_press", "machine_chest_press", "barbell_bench_press", "pec_deck"]
  },
  incline_db_press: {
    name: "Dumbbell Incline Press",
    cue: "Bench at 30°. Dumbbells start at upper chest. Press up and slightly together — don't let elbows flare past 45°.",
    video: "8fXfwG4ftaQ", videoTitle: "The PERFECT Incline Dumbbell Chest Press",
    swaps: ["db_bench_press", "machine_chest_press", "barbell_bench_press"]
  },
  machine_chest_press: {
    name: "Machine Chest Press",
    cue: "Seat adjusted so handles are at mid-chest. Thumbless grip. Press in a slight upward arc — don't lock out. Control the negative.",
    video: "Qu7-ceCvq7w", videoTitle: "The PERFECT Machine Chest Press",
    swaps: ["db_bench_press", "incline_db_press", "pec_deck", "barbell_bench_press"]
  },
  barbell_bench_press: {
    name: "Barbell Bench Press",
    cue: "Shoulder blades pinned back and down, feet planted. Lower the bar to the nipple line, elbows about 45°, then press up. Control it — no bouncing.",
    video: "", videoTitle: "",
    swaps: ["db_bench_press", "machine_chest_press", "incline_db_press"]
  },
  pec_deck: {
    name: "Pec Deck / Cable Fly",
    cue: "Back flat, handles or pads at chest height. Bring them together in front of you, slight elbow bend held, squeeze the chest. Slow return — feel the chest, not the shoulders.",
    video: "", videoTitle: "",
    swaps: ["machine_chest_press", "db_bench_press", "incline_db_press"]
  },
  pushup: {
    name: "Push-up",
    cue: "Hands under the shoulders, body in one straight line. Lower the chest, elbows about 45°, press up. Brace the abs — don't let the hips sag. Hands on a bench to scale it easier.",
    video: "", videoTitle: "",
    swaps: ["db_bench_press", "machine_chest_press", "incline_db_press"]
  },

  // ===== Vertical push =====
  db_shoulder_press: {
    name: "Seated Dumbbell Shoulder Press",
    cue: "Bench upright, back supported. Dumbbells at shoulder height, elbows ~45° from torso. Press up in a slight inward arc. Don't lock out hard.",
    video: "k6tzKisR3NY", videoTitle: "The PERFECT Dumbbell Shoulder Press",
    swaps: ["machine_shoulder_press", "arnold_press", "lateral_raise"]
  },
  machine_shoulder_press: {
    name: "Machine Shoulder Press",
    cue: "Seat so handles are at shoulder height. Forearms vertical at the bottom. Press up in a slight inward arc — don't shrug.",
    video: "6v4nrRVySj0", videoTitle: "The PERFECT Machine Shoulder Press",
    swaps: ["db_shoulder_press", "arnold_press", "lateral_raise"]
  },
  arnold_press: {
    name: "Arnold Press",
    cue: "Start with palms facing you at chest height. Press up while rotating the palms to face forward at the top. Reverse smoothly on the way down. Don't lock out hard.",
    video: "", videoTitle: "",
    swaps: ["db_shoulder_press", "machine_shoulder_press", "lateral_raise"]
  },
  lateral_raise: {
    name: "Dumbbell Lateral Raise",
    cue: "Light dumbbells. Slight bend at elbows, lock that bend. Raise to shoulder height — don't go higher. Lead with the elbows, pinkies slightly up.",
    video: "Kl3LEzQ5Zqs", videoTitle: "The Perfect Lateral Raise",
    swaps: ["cable_lateral_raise", "db_shoulder_press", "machine_shoulder_press"]
  },
  cable_lateral_raise: {
    name: "Cable Lateral Raise",
    cue: "Cable set low, handle across your body. Raise out to the side to shoulder height, lead with the elbow, slight bend held. Slow return. Switch sides.",
    video: "", videoTitle: "",
    swaps: ["lateral_raise", "db_shoulder_press"]
  },

  // ===== Horizontal pull =====
  seated_cable_row: {
    name: "Seated Cable Row",
    cue: "Sit tall, slight forward lean. Pull handle to lower ribs. Drive elbows back, squeeze shoulder blades. Don't yank with your back.",
    video: "8QuMq1GMMng", videoTitle: "How to PROPERLY Seated Cable Row",
    swaps: ["machine_row", "one_arm_db_row", "t_bar_row", "lat_pulldown"]
  },
  machine_row: {
    name: "Chest-Supported Row",
    cue: "Chest pinned to the pad — let it stop your torso from swinging. Pull elbows back and down, squeeze shoulder blades. Don't yank.",
    video: "FTwvmczf7bE", videoTitle: "How To Properly Use The Chest Supported Row Machine",
    swaps: ["seated_cable_row", "one_arm_db_row", "t_bar_row", "lat_pulldown"]
  },
  one_arm_db_row: {
    name: "Single-Arm Dumbbell Row",
    cue: "One hand and knee on the bench, flat back. Row the dumbbell to your hip, drive the elbow back and up, squeeze. Don't twist the torso to lift it.",
    video: "", videoTitle: "",
    swaps: ["seated_cable_row", "machine_row", "t_bar_row", "barbell_row"]
  },
  t_bar_row: {
    name: "T-Bar Row",
    cue: "Chest over the bar, flat back, knees soft. Pull the handles to your stomach, elbows back, squeeze the blades. Lower under control.",
    video: "", videoTitle: "",
    swaps: ["seated_cable_row", "machine_row", "one_arm_db_row", "barbell_row"]
  },
  barbell_row: {
    name: "Barbell Bent-Over Row",
    cue: "Hinge to about 45°, flat back, bar at your shins. Pull to your lower ribs, elbows back, squeeze. Lower under control — don't jerk with the low back.",
    video: "", videoTitle: "",
    swaps: ["seated_cable_row", "machine_row", "one_arm_db_row", "t_bar_row"]
  },
  face_pull: {
    name: "Face Pull",
    cue: "Rope at face height. Pull toward your forehead, splitting the rope apart, elbows high and wide. Squeeze the rear delts, slow return.",
    video: "", videoTitle: "",
    swaps: ["seated_cable_row", "machine_row"]
  },

  // ===== Vertical pull =====
  lat_pulldown: {
    name: "Lat Pulldown",
    cue: "Grip 1.5x shoulder width, slight backward lean. Pull elbows DOWN toward your ribs, not the bar to your chest. Squeeze shoulder blades.",
    video: "hnSqbBk15tw", videoTitle: "Stop Messing Up Your Lat Pulldowns",
    swaps: ["neutral_grip_pulldown", "seated_cable_row", "assisted_pullup", "pullup"]
  },
  assisted_pullup: {
    name: "Assisted Pull-up",
    cue: "Knees on the pad. Pick assistance heavy enough that you can do 8-10 quality reps. Pull elbows down toward your ribs. Don't kip.",
    video: "dc-MFszIdaA", videoTitle: "FORM EXPLAINED — Assisted Pull-up Machine",
    swaps: ["lat_pulldown", "neutral_grip_pulldown", "pullup"]
  },
  neutral_grip_pulldown: {
    name: "Neutral-Grip Pulldown",
    cue: "Neutral (palms-facing) handle. Pull the handle to your upper chest, elbows down toward the ribs, slight lean back. Squeeze, slow return.",
    video: "", videoTitle: "",
    swaps: ["lat_pulldown", "seated_cable_row", "assisted_pullup"]
  },
  pullup: {
    name: "Pull-up",
    cue: "Dead hang, hands just outside shoulders. Pull your chest to the bar, elbows down and back. Control the lower. Use a band or the assisted machine if needed.",
    video: "", videoTitle: "",
    swaps: ["lat_pulldown", "assisted_pullup", "chinup", "neutral_grip_pulldown"]
  },
  chinup: {
    name: "Chin-up",
    cue: "Underhand grip, shoulder width. Pull your chest to the bar, squeeze the biceps and back. Control the way down. Band or assist if needed.",
    video: "", videoTitle: "",
    swaps: ["lat_pulldown", "assisted_pullup", "pullup"]
  },

  // ===== Arms =====
  bicep_curl: {
    name: "Dumbbell Bicep Curl",
    cue: "Standing, dumbbells at sides. Elbows pinned to your ribs. Curl up — don't swing. Squeeze at the top, lower slow on the way down (3 seconds).",
    video: "ICAXJVmOJik", videoTitle: "Fixed In 60 Seconds: DUMBBELL BICEPS CURL",
    swaps: ["hammer_curl", "cable_curl", "preacher_curl"]
  },
  hammer_curl: {
    name: "Dumbbell Hammer Curl",
    cue: "Standing, palms facing each other (neutral grip). Elbows pinned. Curl up — squeeze — slow on the way down. Don't swing.",
    video: "NyW2fT2gQhM", videoTitle: "Hammer Curls — Form Do's and Don'ts",
    swaps: ["bicep_curl", "cable_curl", "preacher_curl"]
  },
  cable_curl: {
    name: "Cable Curl",
    cue: "Stand close to the cable. Elbows pinned to your sides. Curl up — squeeze — full range, slow eccentric. Don't lean back to swing it up.",
    video: "vr68yVuG2ns", videoTitle: "Cable Curl Form Breakdown",
    swaps: ["bicep_curl", "hammer_curl", "preacher_curl"]
  },
  preacher_curl: {
    name: "Preacher Curl",
    cue: "Upper arms flat on the pad. Curl up, squeeze at the top, then lower all the way down and slow. Don't swing off the pad.",
    video: "", videoTitle: "",
    swaps: ["bicep_curl", "cable_curl", "hammer_curl"]
  },
  tricep_pushdown: {
    name: "Tricep Pushdown",
    cue: "Cable rope, elbows pinned to your sides. Push DOWN, not back — your elbows shouldn't move. Full lockout at the bottom, slow return.",
    video: "leazgWMaSo8", videoTitle: "Perfect Tricep Pushdown Form",
    swaps: ["overhead_tricep_extension", "skullcrusher"]
  },
  overhead_tricep_extension: {
    name: "Overhead Tricep Extension",
    cue: "Sit on a bench, dumbbell held overhead with both hands. Elbows close to your ears — they shouldn't flare out. Lower behind the head, extend back up.",
    video: "AYqg9S5FrUU", videoTitle: "Dumbbell Overhead Triceps Extension — Nail Your Form",
    swaps: ["tricep_pushdown", "skullcrusher"]
  },
  skullcrusher: {
    name: "Skullcrusher",
    cue: "Lying down, bar or dumbbells over your forehead. Bend only at the elbows, lower to your hairline, extend back up. Keep the upper arms still.",
    video: "", videoTitle: "",
    swaps: ["tricep_pushdown", "overhead_tricep_extension"]
  },

  // ===== Calves =====
  calf_raise: {
    name: "Standing Calf Raise",
    cue: "On a step or flat ground. Toes forward, full range — heels drop low, push tall to the balls of your feet. Pause 1 second at the top.",
    video: "baEXLy09Ncc", videoTitle: "Get NOTICEABLY BIGGER Calves",
    swaps: ["seated_calf_raise"]
  },
  seated_calf_raise: {
    name: "Seated Calf Raise",
    cue: "Balls of feet on the platform. Heels drop low — feel the stretch — then push tall, pause 1 second at the top.",
    video: "yf4-ZILBnjc", videoTitle: "Matrix Seated Calf Raise Machine Tutorial",
    swaps: ["calf_raise"]
  },

  // ===== Core =====
  suitcase_carry: {
    name: "Suitcase Carry",
    cue: "Hold one heavy DB in one hand at your side. Stand tall — don't lean toward the weight, that's the whole point. Brace abs like you're about to take a punch. Walk 20 paces, switch hands, walk back. That's one set.",
    video: "9xjSFwKIehY", videoTitle: "Suitcase Carry",
    swaps: ["pallof_press", "cable_crunch"]
  },
  pallof_press: {
    name: "Cable Pallof Press",
    cue: "Stand sideways to the cable, handle at chest height. Press the handle straight out. Resist the rotation pulling you back toward the machine — that's the work. Hold 2 seconds, return slow. Switch sides each set.",
    video: "JdhDqvrTE1s", videoTitle: "Cable Standing Pallof Press",
    swaps: ["suitcase_carry", "cable_crunch", "hanging_leg_raise"]
  },
  cable_crunch: {
    name: "Cable Crunch",
    cue: "Kneel facing the cable, rope by your head. Crunch down by rounding your spine, elbows toward your thighs. It's the abs doing the work, not the arms. Slow return.",
    video: "", videoTitle: "",
    swaps: ["pallof_press", "hanging_leg_raise"]
  },
  hanging_leg_raise: {
    name: "Hanging Leg Raise",
    cue: "Dead hang from the bar. Raise your knees (or straight legs) toward your chest, curling the pelvis up. Lower slow — don't swing. Bend the knees to make it easier.",
    video: "", videoTitle: "",
    swaps: ["cable_crunch", "pallof_press"]
  },

  // ===== Conditioning =====
  bike_finisher: {
    name: "Bike — Finisher",
    cue: "Optional cardio block at the end of the session. Easy-to-moderate pace — you can talk in short sentences but you're working. Don't go week 1-2 (legs will be cooked from squats). Add from week 3 onward. Skip-able on any given day.",
    video: "hCAO1JzIi0A", videoTitle: "Best Low Impact Cardio Choice",
    swaps: []
  }
};

// PROGRAM v2 (2026-07-05): each day = 4 fixed ANCHORS (two superset pairs, ss A/B — the progression drivers)
// + 2 ACCESSORIES drawn from a per-day pool that ROTATES weekly (ss C — the novelty slot). 6 moves/session, ~45 min.
// Anchors within a pair share equal set counts. Bike/cardio moved out — log it via the Movement feature instead.
const PROGRAM = {
  monday: {
    title: "Lower — Legs & full body",
    subtitle: "Two superset pairs + a rotating finisher.",
    anchors: [
      { id: "goblet_squat", sets: 3, reps: "8-10", target: "Sit between the hips, drive through the whole foot. Leave 2-3 in the tank.", ss: "A" },
      { id: "db_bench_press", sets: 3, reps: "8-10", target: "Lower to nipple line, press up and slightly together.", ss: "A" },
      { id: "leg_press", sets: 3, reps: "12", target: "A weight you could do 20 with — stop at 12. Don't lock out.", ss: "B" },
      { id: "seated_cable_row", sets: 3, reps: "10", target: "Pull to the lower ribs, squeeze the blades.", ss: "B" }
    ],
    accessories: [
      { id: "calf_raise", sets: 2, reps: "15", target: "Full range, pause 1s at the top." },
      { id: "suitcase_carry", sets: 2, reps: "20 paces each side", target: "Heavy, one hand. Stand tall — don't lean." },
      { id: "pallof_press", sets: 2, reps: "8 each side", target: "Resist the twist. 2s hold." },
      { id: "lateral_raise", sets: 2, reps: "12", target: "Light. Lead with the elbows, pinkies up." }
    ],
    accPerWeek: 2
  },
  wednesday: {
    title: "Upper — Push, pull, arms",
    subtitle: "Two superset pairs + a rotating arm finisher.",
    anchors: [
      { id: "incline_db_press", sets: 3, reps: "8-10", target: "30° bench. Press up and slightly in.", ss: "A" },
      { id: "lat_pulldown", sets: 3, reps: "10", target: "Elbows down toward the ribs, not the bar to the chest.", ss: "A" },
      { id: "db_shoulder_press", sets: 3, reps: "8", target: "Elbows ~45°, press in a slight arc. Don't lock hard.", ss: "B" },
      { id: "machine_row", sets: 3, reps: "10", target: "Chest pinned to the pad. Drive the elbows back.", ss: "B" }
    ],
    accessories: [
      { id: "bicep_curl", sets: 2, reps: "12", target: "Elbows pinned, slow on the way down." },
      { id: "tricep_pushdown", sets: 2, reps: "12", target: "Elbows still, push down to lockout." },
      { id: "hammer_curl", sets: 2, reps: "12", target: "Neutral grip, no swing." },
      { id: "cable_curl", sets: 2, reps: "12", target: "Constant tension, full range." },
      { id: "overhead_tricep_extension", sets: 2, reps: "12", target: "Elbows by the ears, full stretch." },
      { id: "lateral_raise", sets: 2, reps: "12", target: "Light. Lead with the elbows." }
    ],
    accPerWeek: 2
  },
  saturday: {
    title: "Hinge — Hips & core",
    subtitle: "Two superset pairs + a rotating finisher.",
    anchors: [
      { id: "db_rdl", sets: 3, reps: "10", target: "Hips back, DBs slide down the thighs, flat back. Feel the hamstrings.", ss: "A" },
      { id: "db_bench_press", sets: 3, reps: "10", target: "Flat bench, controlled.", ss: "A" },
      { id: "goblet_squat", sets: 3, reps: "10", target: "Same load as your other days.", ss: "B" },
      { id: "lat_pulldown", sets: 3, reps: "10", target: "Leave 2-3 in the tank.", ss: "B" }
    ],
    accessories: [
      { id: "pallof_press", sets: 2, reps: "8 each side", target: "Resist the twist. 2s hold." },
      { id: "calf_raise", sets: 2, reps: "15", target: "Full range, pause at the top." },
      { id: "good_morning", sets: 2, reps: "10", target: "Light. Hinge, flat back, feel the hamstrings." },
      { id: "suitcase_carry", sets: 2, reps: "20 paces each side", target: "Heavy, one hand. Stand tall." }
    ],
    accPerWeek: 2
  }
};

const FEEL_OPTIONS = [
  {
    id: "solid",
    label: "Solid",
    note: "Run the program as written."
  },
  {
    id: "mediocre",
    label: "Mediocre",
    note: "Run as written, but cap RPE at 6 strict. No grinders."
  },
  {
    id: "joints",
    label: "Joints unhappy",
    note: "Drop loads 20%. Skip RDL and any exercise that flares up. Walk warmup +5 min. If pain is sharp, leave the gym."
  }
];

// Conservative day-one starting weights (kg) so the weight field is never blank.
// Beginner / joint-safe for a deconditioned lifter; DB values are per hand, machine/cable are the stack.
// A floor to adjust up from, not a prescription — tune per how it feels.
const STARTING_WEIGHTS = {
  goblet_squat: 8, leg_press: 40, hack_squat: 40, leg_extension: 25, wall_sit: 0,
  db_rdl: 6, good_morning: 6, seated_leg_curl: 25, back_extension: 0, hip_thrust: 40,
  db_bench_press: 10, incline_db_press: 8, machine_chest_press: 20, barbell_bench_press: 30, pec_deck: 25, pushup: 0,
  db_shoulder_press: 6, machine_shoulder_press: 15, arnold_press: 6, lateral_raise: 4, cable_lateral_raise: 5,
  seated_cable_row: 25, machine_row: 25, one_arm_db_row: 12, t_bar_row: 20, barbell_row: 30, face_pull: 15,
  lat_pulldown: 25, assisted_pullup: 25, neutral_grip_pulldown: 30, pullup: 0, chinup: 0,
  bicep_curl: 6, hammer_curl: 6, cable_curl: 10, preacher_curl: 10,
  tricep_pushdown: 10, overhead_tricep_extension: 6, skullcrusher: 15,
  calf_raise: 0, seated_calf_raise: 10,
  suitcase_carry: 12, pallof_press: 10, cable_crunch: 25, hanging_leg_raise: 0,
  bike_finisher: 0
};
