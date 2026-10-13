import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCoachChatResponse } from "@/lib/coach";
import {
  describeCoachChangeProposal,
  toCoachChangeProposalRecord,
} from "@/lib/coach-change-proposals";
import { parsePlanProposalChanges } from "@/lib/training-plan";
import {
  completeWeeklySchedule,
  looksLikeWeekdayName,
  parseWeekdayToken,
  parseWeeklySchedulePayload,
  reviewWeeklySchedule,
} from "@/lib/weekly-schedule";

/** Example: strength Mon–Wed, HIIT Fri–Sat (the reported user request). */
const EXAMPLE_STRENGTH_HIIT_SLOTS = [
  { dayOfWeek: 0, slotType: "strength", templateCode: "w1" },
  { dayOfWeek: 1, slotType: "strength", templateCode: "w2" },
  { dayOfWeek: 2, slotType: "strength", templateCode: "w3" },
  { dayOfWeek: 4, slotType: "hiit" },
  { dayOfWeek: 5, slotType: "hiit" },
];

describe("weekly schedule parsing", () => {
  it("maps weekday names and plurals to dayOfWeek 0=Monday", () => {
    assert.equal(parseWeekdayToken("Monday"), 0);
    assert.equal(parseWeekdayToken("friday"), 4);
    assert.equal(parseWeekdayToken(2), 2);
    assert.equal(looksLikeWeekdayName("Monday"), true);
    assert.equal(looksLikeWeekdayName("Fridays"), true);
    assert.equal(looksLikeWeekdayName("tuesdays"), true);
    assert.equal(looksLikeWeekdayName("2026-10-12"), false);
  });

  it("parses the strength Mon–Wed + HIIT Fri–Sat example schedule", () => {
    const payload = parseWeeklySchedulePayload({
      slots: EXAMPLE_STRENGTH_HIIT_SLOTS,
      weeksToReseed: 2,
    });
    assert.ok(payload);
    assert.equal(payload!.slots.length, 5);
    assert.equal(payload!.slots[0].slotType, "strength");
    assert.equal(payload!.slots[0].templateCode, "w1");
    assert.equal(payload!.slots[3].dayOfWeek, 4);
    assert.equal(payload!.slots[3].slotType, "hiit");
    assert.equal(payload!.slots[3].templateCode, null);

    const complete = completeWeeklySchedule(payload!.slots);
    assert.equal(complete.length, 7);
    assert.equal(complete[3].slotType, "rest"); // Thursday
    assert.equal(complete[6].slotType, "rest"); // Sunday

    const review = reviewWeeklySchedule(payload!.slots);
    assert.ok(review.summaryLines.some((line) => line.includes("Monday")));
    assert.ok(review.summaryLines.some((line) => /HIIT/i.test(line)));
    assert.ok(review.recoveryNote); // Mon–Wed hard streak
  });

  it("accepts weekday name tokens inside slot payloads", () => {
    const payload = parseWeeklySchedulePayload({
      slots: [
        { dayOfWeek: "Monday", slotType: "strength" },
        { weekday: "Wednesday", slot_type: "strength" },
        { day: "Friday", trainingType: "hiit" },
        { day_of_week: "Saturday", training_type: "hiit" },
      ],
    });
    assert.ok(payload);
    assert.deepEqual(
      payload!.slots.map((s) => [s.dayOfWeek, s.slotType]),
      [
        [0, "strength"],
        [2, "strength"],
        [4, "hiit"],
        [5, "hiit"],
      ],
    );
  });

  it("extracts weekly_schedule_proposal from coach JSON", () => {
    const parsed = parseCoachChatResponse(
      JSON.stringify({
        reply:
          "Here’s a weekly schedule: lift Mon–Wed, HIIT Fri–Sat. Confirm to save it.",
        events: [],
        plan_proposal: null,
        weekly_schedule_proposal: {
          reason: "User asked for strength Mon–Wed and HIIT Fri–Sat",
          slots: EXAMPLE_STRENGTH_HIIT_SLOTS,
          weeksToReseed: 2,
        },
      }),
      "2026-10-12",
    );
    assert.equal(parsed.structured, true);
    assert.ok(parsed.weeklyScheduleProposal);
    assert.equal(parsed.planProposal, null);
    const payload = parseWeeklySchedulePayload(
      parsed.weeklyScheduleProposal!.payload,
    );
    assert.ok(payload);
    assert.equal(payload!.slots.filter((s) => s.slotType === "strength").length, 3);
    assert.equal(payload!.slots.filter((s) => s.slotType === "hiit").length, 2);
  });

  it("describes weekly_schedule proposals for confirmation UI", () => {
    const record = toCoachChangeProposalRecord({
      id: "sched-1",
      conversation_id: "c1",
      kind: "weekly_schedule",
      status: "pending",
      reason: "Requested schedule",
      payload: { slots: EXAMPLE_STRENGTH_HIIT_SLOTS },
      created_at: "2026-10-12T10:00:00.000Z",
      resolved_at: null,
    });
    assert.ok(record);
    const lines = describeCoachChangeProposal(record!);
    assert.ok(lines.some((line) => /Monday.*strength/i.test(line)));
    assert.ok(lines.some((line) => /Friday.*HIIT/i.test(line)));
  });
});

describe("plan proposal move dates vs recurring weekdays", () => {
  it("drops move actions that use weekday names or invalid dates", () => {
    const changes = parsePlanProposalChanges([
      {
        entry_id: "a",
        action: "move",
        to_date: "Monday",
      },
      {
        entryId: "b",
        action: "move",
        toDate: "Fridays",
      },
      {
        entry_id: "c",
        action: "move",
        // missing to_date
      },
      {
        entry_id: "d",
        action: "move",
        to_date: "not-a-date",
      },
      {
        entry_id: "e",
        action: "move",
        to_date: "2026-10-17",
      },
      {
        entry_id: "f",
        action: "skip",
      },
    ]);
    assert.equal(changes.length, 2);
    assert.equal(changes[0].entryId, "e");
    assert.equal(changes[0].toDate, "2026-10-17");
    assert.equal(changes[1].entryId, "f");
    assert.equal(changes[1].action, "skip");
  });

  it("keeps one-off ISO moves while recurring schedules use weekly_schedule", () => {
    const moves = parsePlanProposalChanges([
      { entry_id: "x", action: "move", to_date: "2026-10-14" },
    ]);
    assert.equal(moves.length, 1);

    const weekly = parseWeeklySchedulePayload({
      slots: [{ dayOfWeek: 0, slotType: "strength" }],
    });
    assert.ok(weekly);
    assert.equal(looksLikeWeekdayName("Monday"), true);
    assert.equal(looksLikeWeekdayName("2026-10-14"), false);
  });
});
