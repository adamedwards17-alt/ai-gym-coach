/**
 * Initial six-week muscle-building programme configuration.
 * Seeded into per-user tables — not hardcoded in UI rendering.
 *
 * Workout 1 exercises match the supplied programme list.
 * Workout 2/3 follow the supplied focuses (Back/Biceps/Abs;
 * Shoulders/Arms/Legs) with the same prescription style, supersets,
 * rest periods and ~45-minute target.
 */

export type ProgrammeExerciseSeed = {
  exerciseSlug: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  /** Shared letter groups a supersets pair, e.g. "A". */
  supersetGroup: string | null;
  targetRirMin: number;
  targetRirMax: number;
  notes: string | null;
};

export type ProgrammeTemplateSeed = {
  code: string;
  name: string;
  focus: string;
  estimatedDurationMinutes: number;
  exercises: ProgrammeExerciseSeed[];
};

export type ProgrammeWeekSlotSeed = {
  /** 0 = Monday … 6 = Sunday */
  dayOfWeek: number;
  slotType: "strength" | "hiit" | "rest";
  templateCode: string | null;
  title: string;
};

export type ProgrammeDefinition = {
  slug: string;
  name: string;
  description: string;
  phases: Array<{
    slug: string;
    name: string;
    kind: "muscle_building" | "fat_loss" | "other";
    status: "active" | "upcoming" | "completed";
    durationWeeks: number;
    notes: string | null;
    sortOrder: number;
  }>;
  templates: ProgrammeTemplateSeed[];
  weekSlots: ProgrammeWeekSlotSeed[];
  contextNotes: string[];
};

export const MUSCLE_BUILDING_6WK: ProgrammeDefinition = {
  slug: "muscle-building-6wk",
  name: "6-week muscle building",
  description:
    "Three resistance sessions and two HIIT sessions per week. Shoulder and arm hypertrophy priority while maintaining chest, back, core and legs. Double progression with ~1–2 RIR.",
  phases: [
    {
      slug: "hypertrophy-6wk",
      name: "Muscle building (6 weeks)",
      kind: "muscle_building",
      status: "active",
      durationWeeks: 6,
      notes:
        "Prior history of neck/shoulder discomfort — treat as context, not a current diagnosis. Stop any movement that causes pain.",
      sortOrder: 0,
    },
    {
      slug: "fat-loss-4wk",
      name: "Fat loss (~4 weeks)",
      kind: "fat_loss",
      status: "upcoming",
      durationWeeks: 4,
      notes:
        "Planned follow-on phase. Review before switching; do not auto-change nutrition targets.",
      sortOrder: 1,
    },
  ],
  templates: [
    {
      code: "w1",
      name: "Workout 1",
      focus: "Shoulders, chest and triceps",
      estimatedDurationMinutes: 45,
      exercises: [
        {
          exerciseSlug: "seated-db-shoulder-press",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Main compound. Stop if neck/shoulder pain appears.",
        },
        {
          exerciseSlug: "db-lateral-raise",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset A with rear-delt fly.",
        },
        {
          exerciseSlug: "db-rear-delt-fly",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "incline-db-bench-press",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "cable-triceps-pressdown",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset B with overhead extension — same cable station.",
        },
        {
          exerciseSlug: "cable-overhead-triceps-extension",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "cable-chest-fly",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "cable-crunch",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 45,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
      ],
    },
    {
      code: "w2",
      name: "Workout 2",
      focus: "Back, biceps and abs",
      estimatedDurationMinutes: 45,
      exercises: [
        {
          exerciseSlug: "single-arm-db-row",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "seated-cable-row",
          sets: 3,
          repsMin: 10,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "straight-arm-cable-pulldown",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset A with face pulls.",
        },
        {
          exerciseSlug: "cable-face-pull",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "incline-db-curl",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset B with rope curls.",
        },
        {
          exerciseSlug: "cable-rope-curl",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "cable-crunch",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 45,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "lying-leg-raise",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 45,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
      ],
    },
    {
      code: "w3",
      name: "Workout 3",
      focus: "Shoulders, arms and legs",
      estimatedDurationMinutes: 45,
      exercises: [
        {
          exerciseSlug: "goblet-squat",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "db-romanian-deadlift",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "seated-db-shoulder-press",
          sets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Shoulder priority. Stop if pain appears.",
        },
        {
          exerciseSlug: "cable-lateral-raise",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset A with rope curls.",
        },
        {
          exerciseSlug: "cable-rope-curl",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "A",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "cable-triceps-pressdown",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: "Superset B with overhead extension.",
        },
        {
          exerciseSlug: "cable-overhead-triceps-extension",
          sets: 3,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 60,
          supersetGroup: "B",
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
        {
          exerciseSlug: "standing-calf-raise",
          sets: 3,
          repsMin: 12,
          repsMax: 15,
          restSeconds: 45,
          supersetGroup: null,
          targetRirMin: 1,
          targetRirMax: 2,
          notes: null,
        },
      ],
    },
  ],
  weekSlots: [
    { dayOfWeek: 0, slotType: "strength", templateCode: "w1", title: "Workout 1 · Shoulders, chest, triceps" },
    { dayOfWeek: 1, slotType: "hiit", templateCode: null, title: "HIIT" },
    { dayOfWeek: 2, slotType: "rest", templateCode: null, title: "Rest" },
    { dayOfWeek: 3, slotType: "strength", templateCode: "w2", title: "Workout 2 · Back, biceps, abs" },
    { dayOfWeek: 4, slotType: "hiit", templateCode: null, title: "HIIT" },
    { dayOfWeek: 5, slotType: "strength", templateCode: "w3", title: "Workout 3 · Shoulders, arms, legs" },
    { dayOfWeek: 6, slotType: "rest", templateCode: null, title: "Rest" },
  ],
  contextNotes: [
    "Double progression: add reps within the range, then increase load when all working sets hit the top of the range with ~1–2 RIR and good form.",
    "Dumbbell weights are logged per dumbbell unless noted otherwise.",
    "Prior neck/shoulder discomfort is contextual — do not push through pain.",
  ],
};

export function assertProgrammeIntegrity(def: ProgrammeDefinition): string[] {
  const errors: string[] = [];
  const templateCodes = new Set(def.templates.map((t) => t.code));
  for (const slot of def.weekSlots) {
    if (slot.slotType === "strength" && !slot.templateCode) {
      errors.push(`Day ${slot.dayOfWeek}: strength slot missing template`);
    }
    if (slot.templateCode && !templateCodes.has(slot.templateCode)) {
      errors.push(`Day ${slot.dayOfWeek}: unknown template ${slot.templateCode}`);
    }
  }
  for (const template of def.templates) {
    if (template.exercises.length === 0) {
      errors.push(`${template.code}: no exercises`);
    }
    template.exercises.forEach((ex, index) => {
      if (ex.repsMax < ex.repsMin) {
        errors.push(`${template.code}#${index}: reps_max < reps_min`);
      }
      if (ex.sets < 1) {
        errors.push(`${template.code}#${index}: invalid sets`);
      }
    });
  }
  const w1 = def.templates.find((t) => t.code === "w1");
  const requiredW1 = [
    "seated-db-shoulder-press",
    "db-lateral-raise",
    "db-rear-delt-fly",
    "incline-db-bench-press",
    "cable-triceps-pressdown",
    "cable-overhead-triceps-extension",
    "cable-chest-fly",
    "cable-crunch",
  ];
  if (w1) {
    const slugs = w1.exercises.map((e) => e.exerciseSlug);
    for (const slug of requiredW1) {
      if (!slugs.includes(slug)) {
        errors.push(`Workout 1 missing required exercise ${slug}`);
      }
    }
  } else {
    errors.push("Workout 1 template missing");
  }
  return errors;
}
