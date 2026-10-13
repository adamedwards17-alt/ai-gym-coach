/**
 * Recurring weekly training schedule helpers.
 * dayOfWeek: 0 = Monday … 6 = Sunday (matches programme_week_slots).
 */

export type WeeklySlotType = "strength" | "hiit" | "rest" | "other";

export type WeeklyScheduleSlot = {
  dayOfWeek: number;
  slotType: WeeklySlotType;
  title: string;
  /** Optional strength template code (w1/w2/w3). */
  templateCode?: string | null;
  plannedDurationMinutes?: number | null;
};

export type WeeklyScheduleProposalPayload = {
  slots: WeeklyScheduleSlot[];
  /** How many weeks of future planned entries to rewrite (default 2). */
  weeksToReseed?: number;
};

export type WeeklyScheduleReview = {
  summaryLines: string[];
  recoveryNote: string | null;
};

const WEEKDAY_ALIASES: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function weekdayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function parseWeekdayToken(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const day = Math.round(value);
    return day >= 0 && day <= 6 ? day : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim().toLowerCase().replace(/\.$/, "");
  if (/^\d+$/.test(cleaned)) {
    const day = Number(cleaned);
    return day >= 0 && day <= 6 ? day : null;
  }
  return WEEKDAY_ALIASES[cleaned] ?? null;
}

export function isWeeklySlotType(value: unknown): value is WeeklySlotType {
  return (
    value === "strength" ||
    value === "hiit" ||
    value === "rest" ||
    value === "other"
  );
}

function defaultTitle(slotType: WeeklySlotType, templateCode?: string | null): string {
  if (slotType === "strength") {
    if (templateCode === "w1") return "Workout 1";
    if (templateCode === "w2") return "Workout 2";
    if (templateCode === "w3") return "Workout 3";
    return "Strength";
  }
  if (slotType === "hiit") return "HIIT";
  if (slotType === "rest") return "Rest";
  return "Session";
}

function defaultDuration(slotType: WeeklySlotType): number | null {
  if (slotType === "strength") return 45;
  if (slotType === "hiit") return 30;
  return null;
}

/**
 * Parse a weekly_schedule proposal payload.
 * Accepts dayOfWeek numbers or weekday names; does not treat weekdays as dates.
 */
export function parseWeeklySchedulePayload(
  raw: unknown,
): WeeklyScheduleProposalPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const slotsRaw = Array.isArray(record.slots) ? record.slots : [];
  const slots: WeeklyScheduleSlot[] = [];
  let strengthIndex = 0;

  for (const item of slotsRaw.slice(0, 14)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const slot = item as Record<string, unknown>;
    const dayOfWeek = parseWeekdayToken(
      slot.dayOfWeek ?? slot.day_of_week ?? slot.weekday ?? slot.day,
    );
    if (dayOfWeek == null) {
      continue;
    }

    let slotType: WeeklySlotType | null = isWeeklySlotType(slot.slotType)
      ? slot.slotType
      : isWeeklySlotType(slot.slot_type)
        ? slot.slot_type
        : null;
    if (!slotType && typeof slot.trainingType === "string") {
      if (slot.trainingType === "strength") slotType = "strength";
      else if (slot.trainingType === "hiit") slotType = "hiit";
      else if (slot.trainingType === "rest") slotType = "rest";
      else slotType = "other";
    }
    if (!slotType && typeof slot.training_type === "string") {
      if (slot.training_type === "strength") slotType = "strength";
      else if (slot.training_type === "hiit") slotType = "hiit";
      else if (slot.training_type === "rest") slotType = "rest";
      else slotType = "other";
    }
    if (!slotType) {
      continue;
    }

    let templateCode =
      typeof slot.templateCode === "string"
        ? slot.templateCode.trim().slice(0, 20)
        : typeof slot.template_code === "string"
          ? slot.template_code.trim().slice(0, 20)
          : null;
    if (slotType === "strength" && !templateCode) {
      const codes = ["w1", "w2", "w3"] as const;
      templateCode = codes[strengthIndex % 3];
      strengthIndex += 1;
    }
    if (slotType !== "strength") {
      templateCode = null;
    }

    const titleRaw =
      typeof slot.title === "string" && slot.title.trim()
        ? slot.title.trim().slice(0, 120)
        : defaultTitle(slotType, templateCode);

    const durationRaw =
      slot.plannedDurationMinutes ?? slot.planned_duration_minutes;
    const plannedDurationMinutes =
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? Math.round(durationRaw)
        : defaultDuration(slotType);

    slots.push({
      dayOfWeek,
      slotType,
      title: titleRaw,
      templateCode,
      plannedDurationMinutes,
    });
  }

  if (slots.length === 0) {
    return null;
  }

  // Deduplicate by day — last write wins.
  const byDay = new Map<number, WeeklyScheduleSlot>();
  for (const slot of slots) {
    byDay.set(slot.dayOfWeek, slot);
  }

  const weeksRaw = record.weeksToReseed ?? record.weeks_to_reseed;
  const weeksToReseed =
    typeof weeksRaw === "number" && Number.isFinite(weeksRaw)
      ? Math.min(4, Math.max(1, Math.round(weeksRaw)))
      : 2;

  return {
    slots: [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    weeksToReseed,
  };
}

/** Fill unspecified weekdays as rest so the week is complete. */
export function completeWeeklySchedule(
  slots: WeeklyScheduleSlot[],
): WeeklyScheduleSlot[] {
  const byDay = new Map(slots.map((slot) => [slot.dayOfWeek, slot]));
  const complete: WeeklyScheduleSlot[] = [];
  for (let day = 0; day <= 6; day += 1) {
    complete.push(
      byDay.get(day) ?? {
        dayOfWeek: day,
        slotType: "rest",
        title: "Rest",
        templateCode: null,
        plannedDurationMinutes: null,
      },
    );
  }
  return complete;
}

export function describeWeeklySchedule(slots: WeeklyScheduleSlot[]): string[] {
  return completeWeeklySchedule(slots).map((slot) => {
    if (slot.slotType === "rest") {
      return `${weekdayLabel(slot.dayOfWeek)}: Rest`;
    }
    return `${weekdayLabel(slot.dayOfWeek)}: ${slot.title} (${slot.slotType})`;
  });
}

/**
 * Soft recovery note — does not block the schedule.
 * Flags 3+ consecutive hard training days (strength/hiit/other).
 */
export function reviewWeeklySchedule(
  slots: WeeklyScheduleSlot[],
): WeeklyScheduleReview {
  const complete = completeWeeklySchedule(slots);
  const summaryLines = describeWeeklySchedule(complete);

  let streak = 0;
  let maxStreak = 0;
  for (const slot of complete) {
    if (slot.slotType === "rest") {
      streak = 0;
    } else {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    }
  }
  // Also check wrap Fri–Sun–Mon if needed — keep simple for Mon–Sun week.

  let recoveryNote: string | null = null;
  if (maxStreak >= 3) {
    recoveryNote = `This places ${maxStreak} training days in a row. That’s fine if recovery feels good — consider an easier session or rest if soreness or sleep drops.`;
  }

  return { summaryLines, recoveryNote };
}

/**
 * Detect whether a string looks like a weekday preference rather than an ISO date.
 * Used to reject invalid move dates before they reach the user.
 */
export function looksLikeWeekdayName(value: string): boolean {
  const cleaned = value.trim().toLowerCase().replace(/s$/, "");
  return parseWeekdayToken(cleaned) != null || parseWeekdayToken(value) != null;
}
