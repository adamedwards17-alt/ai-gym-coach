import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimInMemory,
  runCoachingPass,
} from "@/lib/coaching-notification-run";
import {
  claimCoachingDedupe,
  countsAsCoachingSend,
  decideCoachingNotification,
  notificationCopyIsSafe,
  resolveTimeZone,
  zonedClock,
  type CoachingFacts,
} from "@/lib/coaching-notifications";

function facts(overrides: Partial<CoachingFacts> = {}): CoachingFacts {
  return {
    userId: "user-a",
    timeZone: "Europe/London",
    coachingEnabled: true,
    now: new Date("2026-01-15T08:30:00.000Z"),
    checkIns: [],
    meals: [],
    sessions: [],
    planEntries: [],
    proteinTargetG: 150,
    coachMessages: [],
    events: [],
    ...overrides,
  };
}

describe("coaching notification decisions", () => {
  it("does not remind someone who already checked in", () => {
    const decision = decideCoachingNotification(
      facts({
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "strength",
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("does not remind someone who already trained", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T17:30:00.000Z"),
        proteinTargetG: 150,
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T12:00:00.000Z",
            status: "eaten",
            proteinG: 160,
          },
        ],
        planEntries: [
          {
            planDate: "2026-01-15",
            trainingType: "strength",
            status: "completed",
          },
        ],
        sessions: [
          {
            sessionDate: "2026-01-15",
            createdAt: "2026-01-15T17:00:00.000Z",
            trainingType: "strength",
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("does not prompt a workout on a planned rest day", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T17:30:00.000Z"),
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T12:00:00.000Z",
            status: "eaten",
            proteinG: 160,
          },
        ],
        planEntries: [
          { planDate: "2026-01-15", trainingType: "rest", status: "planned" },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("does not send a protein reminder once the target is reached", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T16:00:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T12:00:00.000Z",
            status: "eaten",
            proteinG: 150,
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("does not claim the user has not eaten when meals are missing", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T16:00:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        meals: [],
        proteinTargetG: 150,
      }),
    );
    assert.equal(decision?.purpose, "nutrition");
    assert.equal(notificationCopyIsSafe(decision?.body ?? ""), true);
    assert.equal(decision?.body.toLowerCase().includes("eaten"), true);
    assert.equal(decision?.url, "/coach?intent=protein");
  });

  it("asks a protein question without a measurement when protein is unknown", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T16:00:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T12:00:00.000Z",
            status: "eaten",
            proteinG: null,
          },
        ],
      }),
    );
    assert.equal(decision?.purpose, "nutrition");
    assert.equal(notificationCopyIsSafe(decision?.body ?? ""), true);
  });

  it("skips nutrition just after a meal was logged", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T16:00:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T15:30:00.000Z",
            status: "eaten",
            proteinG: 20,
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("enforces the daily limit of two coaching notifications", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T20:30:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        meals: [
          {
            loggedDate: "2026-01-15",
            createdAt: "2026-01-15T12:00:00.000Z",
            status: "eaten",
            proteinG: 160,
          },
        ],
        events: [
          {
            purpose: "morning_intention",
            status: "sent",
            createdAt: "2026-01-15T08:00:00.000Z",
            localDate: "2026-01-15",
          },
          {
            purpose: "nutrition",
            status: "sent",
            createdAt: "2026-01-15T12:30:00.000Z",
            localDate: "2026-01-15",
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("respects the cooldown between coaching notifications", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T16:00:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "rest",
          },
        ],
        events: [
          {
            purpose: "morning_intention",
            status: "sent",
            createdAt: "2026-01-15T15:00:00.000Z",
            localDate: "2026-01-15",
          },
        ],
      }),
    );
    assert.equal(decision, null);
  });

  it("does not let a manual test send count toward the coaching limit", () => {
    assert.equal(
      countsAsCoachingSend({ purpose: "test", status: "sent" }),
      false,
    );
    const decision = decideCoachingNotification(
      facts({
        events: [
          {
            purpose: "test",
            status: "sent",
            createdAt: "2026-01-15T08:00:00.000Z",
            localDate: "2026-01-15",
          },
        ],
      }),
    );
    assert.equal(decision?.purpose, "morning_intention");
  });

  it("does not send when coaching notifications are disabled", () => {
    const decision = decideCoachingNotification(
      facts({ coachingEnabled: false }),
    );
    assert.equal(decision, null);
  });

  it("keeps each user's facts separate", () => {
    const sharedNow = new Date("2026-01-15T08:30:00.000Z");
    const checkedIn = decideCoachingNotification(
      facts({
        userId: "user-a",
        now: sharedNow,
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "strength",
          },
        ],
      }),
    );
    const waiting = decideCoachingNotification(
      facts({ userId: "user-b", now: sharedNow }),
    );
    assert.equal(checkedIn, null);
    assert.equal(waiting?.purpose, "morning_intention");
    assert.equal(waiting?.url, "/today");
  });

  it("uses the user's timezone, including daylight-saving changes", () => {
    const summer = zonedClock(
      new Date("2026-07-15T11:00:00.000Z"),
      "Europe/London",
    );
    const winter = zonedClock(
      new Date("2026-01-15T11:00:00.000Z"),
      "Europe/London",
    );
    const beforeChange = zonedClock(
      new Date("2026-01-15T01:30:00.000Z"),
      "Europe/London",
    );
    const afterChange = zonedClock(
      new Date("2026-03-29T01:30:00.000Z"),
      "Europe/London",
    );
    const newYorkWinter = zonedClock(
      new Date("2026-01-15T23:30:00.000Z"),
      "America/New_York",
    );
    assert.equal(summer.minutes, 12 * 60);
    assert.equal(winter.minutes, 11 * 60);
    assert.equal(beforeChange.minutes, 90);
    assert.equal(afterChange.minutes, 150);
    assert.equal(newYorkWinter.date, "2026-01-15");
    assert.equal(newYorkWinter.minutes, 18 * 60 + 30);
    assert.equal(resolveTimeZone("Not/AZone"), "Europe/London");
  });

  it("personalises the morning window only after five observations", () => {
    const history = [10, 11, 12, 13, 14].map((day) => ({
      checkInDate: `2026-01-${day}`,
      createdAt: `2026-01-${day}T10:30:00.000Z`,
      plannedTraining: "strength",
    }));
    const learned = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T10:30:00.000Z"),
        checkIns: history,
      }),
    );
    const tooFew = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T10:30:00.000Z"),
        checkIns: history.slice(0, 2),
      }),
    );
    assert.equal(learned?.purpose, "morning_intention");
    assert.equal(tooFew, null);
  });

  it("prefers a planned workout over a generic nutrition prompt", () => {
    const decision = decideCoachingNotification(
      facts({
        now: new Date("2026-01-15T17:30:00.000Z"),
        checkIns: [
          {
            checkInDate: "2026-01-15",
            createdAt: "2026-01-15T08:00:00.000Z",
            plannedTraining: "strength",
          },
        ],
        planEntries: [
          {
            planDate: "2026-01-15",
            trainingType: "strength",
            status: "planned",
          },
        ],
      }),
    );
    assert.equal(decision?.purpose, "workout");
    assert.equal(decision?.url, "/train");
    assert.equal(notificationCopyIsSafe(decision?.body ?? ""), true);
  });

  it("does not send a second claim for the same user, purpose, and day", () => {
    const claimed = new Set<string>();
    const first = claimCoachingDedupe(claimed, "user-a:workout:2026-01-15");
    const second = claimCoachingDedupe(claimed, "user-a:workout:2026-01-15");
    const otherUser = claimCoachingDedupe(claimed, "user-b:workout:2026-01-15");
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(otherUser, true);
  });

  it("does not deliver twice when a cron run is repeated", async () => {
    const claimed = new Set<string>();
    let deliveries = 0;
    const snapshot = facts();
    const result = await runCoachingPass({
      now: snapshot.now,
      loadSnapshots: async () => [snapshot, snapshot],
      claim: async (row, decision) =>
        claimInMemory(claimed, row, decision, "2026-01-15"),
      deliver: async () => {
        deliveries += 1;
        return { delivered: true, expiredSubscriptionIds: [] };
      },
      recordResult: async () => {},
    });
    assert.equal(result.sent, 1);
    assert.equal(deliveries, 1);
  });

  it("records an expired subscription without sending another user's notification", async () => {
    const expired: string[] = [];
    const sentUsers: string[] = [];
    await runCoachingPass({
      now: new Date("2026-01-15T08:30:00.000Z"),
      loadSnapshots: async () => [
        facts({ userId: "user-a" }),
        facts({ userId: "user-b", coachingEnabled: false }),
      ],
      claim: async () => true,
      deliver: async (row) => {
        sentUsers.push(row.userId);
        return {
          delivered: false,
          expiredSubscriptionIds: ["sub-1"],
        };
      },
      recordResult: async (_row, _decision, result) => {
        expired.push(...result.expiredSubscriptionIds);
      },
    });
    assert.deepEqual(sentUsers, ["user-a"]);
    assert.deepEqual(expired, ["sub-1"]);
  });
});
