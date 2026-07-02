// Marcus's Phase 1 Program — Weeks 1-6
// Loading rule: every set leaves 4 reps in the tank. RPE 6.
// Hard rules: no barbell back squat / deadlift / overhead press in Phase 1.
// Joint pain (sharp, not muscle burn) = stop, swap, log it.

const EXERCISE_LIBRARY = {
  goblet_squat: {
    name: "Goblet Squat",
    cue: "Feet just outside hip width, dumbbell at chest. Sit between your hips, not back. Knees track over your middle toes. Drive through the whole foot.",
    video: "t__Um6KjJkc",
    videoTitle: "PERFECT Goblet Squat Form",
    swaps: ["leg_press", "wall_sit", "db_rdl"]
  },
  leg_press: {
    name: "Leg Press",
    cue: "Feet shoulder-width on the platform, mid-foot. Lower under control until knees ~90°. Drive through heels — don't lock out at the top.",
    video: "nDh_BlnLCGc",
    videoTitle: "How To Leg Press With Perfect Technique",
    swaps: ["goblet_squat", "wall_sit", "db_rdl"]
  },
  lat_pulldown: {
    name: "Lat Pulldown",
    cue: "Grip 1.5x shoulder width, slight backward lean. Pull elbows DOWN toward your ribs, not the bar to your chest. Squeeze shoulder blades.",
    video: "hnSqbBk15tw",
    videoTitle: "Stop Messing Up Your Lat Pulldowns",
    swaps: ["seated_cable_row", "assisted_pullup"]
  },
  db_bench_press: {
    name: "Dumbbell Chest Press",
    cue: "Flat bench, feet planted. Dumbbells over chest, lower to nipple line. Wrists stacked over elbows. Press up and slightly together.",
    video: "1V3vpcaxRYQ",
    videoTitle: "Best Dumbbell Bench Press Tutorial",
    swaps: ["incline_db_press", "machine_chest_press"]
  },
  incline_db_press: {
    name: "Dumbbell Incline Press",
    cue: "Bench at 30°. Dumbbells start at upper chest. Press up and slightly together — don't let elbows flare past 45°.",
    video: "8fXfwG4ftaQ",
    videoTitle: "The PERFECT Incline Dumbbell Chest Press",
    swaps: ["db_bench_press", "machine_chest_press"]
  },
  seated_cable_row: {
    name: "Seated Cable Row",
    cue: "Sit tall, slight forward lean. Pull handle to lower ribs. Drive elbows back, squeeze shoulder blades. Don't yank with your back.",
    video: "8QuMq1GMMng",
    videoTitle: "How to PROPERLY Seated Cable Row",
    swaps: ["lat_pulldown", "machine_row"]
  },
  db_shoulder_press: {
    name: "Seated Dumbbell Shoulder Press",
    cue: "Bench upright, back supported. Dumbbells at shoulder height, elbows ~45° from torso. Press up in a slight inward arc. Don't lock out hard.",
    video: "k6tzKisR3NY",
    videoTitle: "The PERFECT Dumbbell Shoulder Press",
    swaps: ["machine_shoulder_press", "lateral_raise"]
  },
  calf_raise: {
    name: "Standing Calf Raise",
    cue: "On a step or flat ground. Toes forward, full range — heels drop low, push tall to the balls of your feet. Pause 1 second at the top.",
    video: "baEXLy09Ncc",
    videoTitle: "Get NOTICEABLY BIGGER Calves",
    swaps: ["seated_calf_raise"]
  },
  bicep_curl: {
    name: "Dumbbell Bicep Curl",
    cue: "Standing, dumbbells at sides. Elbows pinned to your ribs. Curl up — don't swing. Squeeze at the top, lower slow on the way down (3 seconds).",
    video: "ICAXJVmOJik",
    videoTitle: "Fixed In 60 Seconds: DUMBBELL BICEPS CURL",
    swaps: ["hammer_curl", "cable_curl"]
  },
  tricep_pushdown: {
    name: "Tricep Pushdown",
    cue: "Cable rope, elbows pinned to your sides. Push DOWN, not back — your elbows shouldn't move. Full lockout at the bottom, slow return.",
    video: "leazgWMaSo8",
    videoTitle: "Perfect Tricep Pushdown Form",
    swaps: ["overhead_tricep_extension"]
  },
  db_rdl: {
    name: "Romanian Deadlift (Dumbbells)",
    cue: "Light weight — this is form work, not strength. Knees soft, push hips BACK toward the wall behind you. Dumbbells slide along the front of your legs. Stop at mid-shin or when you feel a hamstring stretch. Back stays flat.",
    video: "hu3jRvTc_po",
    videoTitle: "The PERFECT Dumbbell Romanian Deadlift",
    swaps: ["leg_press", "good_morning"]
  },

  // ===== Substitution-only exercises (used via swap pills) =====
  wall_sit: {
    name: "Wall Sit",
    cue: "Back flat against wall. Slide down until thighs are parallel to floor — knees at 90°. Hold. Drive knees out, not in. 30 sec to start.",
    video: "jHOVjaDqj-M",
    videoTitle: "Beginner Wall Sit Exercises",
    swaps: ["goblet_squat", "leg_press"]
  },
  machine_chest_press: {
    name: "Machine Chest Press",
    cue: "Seat adjusted so handles are at mid-chest. Thumbless grip. Press in a slight upward arc — don't lock out. Control the negative.",
    video: "Qu7-ceCvq7w",
    videoTitle: "The PERFECT Machine Chest Press",
    swaps: ["db_bench_press", "incline_db_press"]
  },
  assisted_pullup: {
    name: "Assisted Pull-up",
    cue: "Knees on the pad. Pick assistance heavy enough that you can do 8-10 quality reps. Pull elbows down toward your ribs. Don't kip.",
    video: "dc-MFszIdaA",
    videoTitle: "FORM EXPLAINED — Assisted Pull-up Machine",
    swaps: ["lat_pulldown", "seated_cable_row"]
  },
  machine_row: {
    name: "Chest-Supported Row",
    cue: "Chest pinned to the pad — let it stop your torso from swinging. Pull elbows back and down, squeeze shoulder blades. Don't yank.",
    video: "FTwvmczf7bE",
    videoTitle: "How To Properly Use The Chest Supported Row Machine",
    swaps: ["seated_cable_row", "lat_pulldown"]
  },
  machine_shoulder_press: {
    name: "Machine Shoulder Press",
    cue: "Seat so handles are at shoulder height. Forearms vertical at the bottom. Press up in a slight inward arc — don't shrug.",
    video: "6v4nrRVySj0",
    videoTitle: "The PERFECT Machine Shoulder Press",
    swaps: ["db_shoulder_press", "lateral_raise"]
  },
  lateral_raise: {
    name: "Dumbbell Lateral Raise",
    cue: "Light dumbbells. Slight bend at elbows, lock that bend. Raise to shoulder height — don't go higher. Lead with the elbows, pinkies slightly up.",
    video: "Kl3LEzQ5Zqs",
    videoTitle: "The Perfect Lateral Raise",
    swaps: ["db_shoulder_press", "machine_shoulder_press"]
  },
  seated_calf_raise: {
    name: "Seated Calf Raise",
    cue: "Balls of feet on the platform. Heels drop low — feel the stretch — then push tall, pause 1 second at the top.",
    video: "yf4-ZILBnjc",
    videoTitle: "Matrix Seated Calf Raise Machine Tutorial",
    swaps: ["calf_raise"]
  },
  hammer_curl: {
    name: "Dumbbell Hammer Curl",
    cue: "Standing, palms facing each other (neutral grip). Elbows pinned. Curl up — squeeze — slow on the way down. Don't swing.",
    video: "NyW2fT2gQhM",
    videoTitle: "Hammer Curls — Form Do's and Don'ts",
    swaps: ["bicep_curl", "cable_curl"]
  },
  cable_curl: {
    name: "Cable Curl",
    cue: "Stand close to the cable. Elbows pinned to your sides. Curl up — squeeze — full range, slow eccentric. Don't lean back to swing it up.",
    video: "vr68yVuG2ns",
    videoTitle: "Cable Curl Form Breakdown",
    swaps: ["bicep_curl", "hammer_curl"]
  },
  overhead_tricep_extension: {
    name: "Overhead Tricep Extension",
    cue: "Sit on a bench, dumbbell held overhead with both hands. Elbows close to your ears — they shouldn't flare out. Lower behind the head, extend back up.",
    video: "AYqg9S5FrUU",
    videoTitle: "Dumbbell Overhead Triceps Extension — Nail Your Form",
    swaps: ["tricep_pushdown"]
  },
  good_morning: {
    name: "Dumbbell Good Morning",
    cue: "Light weight. Dumbbells across upper back. Knees soft — push hips BACK like you're closing a car door with your butt. Hinge until you feel the hamstrings stretch. Back stays flat.",
    video: "SfljAHC7_DU",
    videoTitle: "Dumbbell Good Morning",
    swaps: ["db_rdl", "leg_press"]
  },
  suitcase_carry: {
    name: "Suitcase Carry",
    cue: "Hold one heavy DB in one hand at your side. Stand tall — don't lean toward the weight, that's the whole point. Brace abs like you're about to take a punch. Walk 20 paces, switch hands, walk back. That's one set.",
    video: "9xjSFwKIehY",
    videoTitle: "Suitcase Carry",
    swaps: ["pallof_press"]
  },
  pallof_press: {
    name: "Cable Pallof Press",
    cue: "Stand sideways to the cable, handle at chest height. Press the handle straight out. Resist the rotation pulling you back toward the machine — that's the work. Hold 2 seconds, return slow. Switch sides each set.",
    video: "JdhDqvrTE1s",
    videoTitle: "Cable Standing Pallof Press",
    swaps: ["suitcase_carry"]
  },
  bike_finisher: {
    name: "Bike — Finisher",
    cue: "Optional cardio block at the end of the session. Easy-to-moderate pace — you can talk in short sentences but you're working. Don't go week 1-2 (legs will be cooked from squats). Add from week 3 onward. Skip-able on any given day.",
    video: "hCAO1JzIi0A",
    videoTitle: "Best Low Impact Cardio Choice",
    swaps: []
  }
};

const PROGRAM = {
  monday: {
    title: "Lower — Legs & full body",
    subtitle: "Full body, lower-body focus.",
    exercises: [
      { id: "goblet_squat", sets: 3, reps: "10", target: "8 kg DB to start" },
      { id: "leg_press", sets: 3, reps: "12", target: "Pick a weight you could do 20 with — only do 12" },
      { id: "lat_pulldown", sets: 3, reps: "10", target: "RPE 6 — 4 reps in the tank" },
      { id: "db_bench_press", sets: 3, reps: "10", target: "RPE 6" },
      { id: "seated_cable_row", sets: 3, reps: "10", target: "RPE 6" },
      { id: "calf_raise", sets: 3, reps: "15", target: "Bodyweight or light DB" },
      { id: "suitcase_carry", sets: 3, reps: "20 paces each side", target: "Heavy DB, one hand. Stand tall — don't lean." },
      { id: "bike_finisher", sets: 1, reps: "15-20 min", target: "Optional. Skip weeks 1-2. Add from week 3." }
    ]
  },
  wednesday: {
    title: "Upper — Push, pull, arms",
    subtitle: "Full body, upper-body focus.",
    exercises: [
      { id: "incline_db_press", sets: 3, reps: "10", target: "Bench at 30°. Start light." },
      { id: "lat_pulldown", sets: 3, reps: "10", target: "Same as Monday" },
      { id: "db_shoulder_press", sets: 3, reps: "8", target: "Start with 5-6 kg DBs" },
      { id: "seated_cable_row", sets: 3, reps: "10", target: "Same as Monday" },
      { id: "goblet_squat", sets: 2, reps: "10", target: "Maintenance — same load as Monday" },
      { id: "bicep_curl", sets: 2, reps: "12", target: "Superset with tricep pushdown" },
      { id: "tricep_pushdown", sets: 2, reps: "12", target: "Superset with bicep curl" },
      { id: "suitcase_carry", sets: 3, reps: "20 paces each side", target: "Heavy DB, one hand. Stand tall — don't lean." },
      { id: "bike_finisher", sets: 1, reps: "15-20 min", target: "Optional. Skip weeks 1-2. Add from week 3." }
    ]
  },
  saturday: {
    title: "Hinge — Hips & core",
    subtitle: "Full body, hip-hinge focus.",
    exercises: [
      { id: "goblet_squat", sets: 3, reps: "10", target: "Same load as Mon/Wed" },
      { id: "db_rdl", sets: 3, reps: "10", target: "LIGHT — 6-8 kg DBs. Form work, not strength." },
      { id: "lat_pulldown", sets: 3, reps: "10", target: "RPE 6" },
      { id: "db_bench_press", sets: 3, reps: "10", target: "Flat bench. RPE 6." },
      { id: "seated_cable_row", sets: 3, reps: "10", target: "RPE 6" },
      { id: "calf_raise", sets: 3, reps: "15", target: "Bodyweight or light DB" },
      { id: "pallof_press", sets: 3, reps: "8 each side", target: "Cable at chest height. 2-second hold each rep." },
      { id: "bike_finisher", sets: 1, reps: "15-20 min", target: "Optional. Skip weeks 1-2. Add from week 3." }
    ]
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
  goblet_squat: 8, leg_press: 40, lat_pulldown: 25, db_bench_press: 10, incline_db_press: 8,
  seated_cable_row: 25, db_shoulder_press: 6, calf_raise: 0, bicep_curl: 6, tricep_pushdown: 10,
  db_rdl: 6, wall_sit: 0, machine_chest_press: 20, machine_row: 25, machine_shoulder_press: 15,
  lateral_raise: 4, seated_calf_raise: 10, hammer_curl: 6, cable_curl: 10, overhead_tricep_extension: 6,
  good_morning: 6, suitcase_carry: 12, pallof_press: 10, bike_finisher: 0
};
