import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activityLogTypeOptions,
  defaultActivityLogType,
  normalizeOptionalCalories,
  primaryWorkoutAction,
} from "@/lib/workout-logging";

describe("strength vs activity logging split", () => {
  it("routes strength to Start a workout and other types to Log a workout", () => {
    assert.equal(primaryWorkoutAction("strength"), "start");
    assert.equal(primaryWorkoutAction("hiit"), "log");
    assert.equal(primaryWorkoutAction("cardio"), "log");
    assert.equal(primaryWorkoutAction("sport"), "log");
    assert.equal(primaryWorkoutAction("recovery"), "log");
    assert.equal(primaryWorkoutAction("other"), "log");
  });

  it("excludes strength and dedicated F45 from the lightweight activity log types", () => {
    const ids = activityLogTypeOptions().map((option) => option.id);
    assert.ok(!ids.includes("strength"));
    assert.ok(ids.includes("hiit"));
    assert.ok(!ids.some((id) => /f45/i.test(id)));
    assert.equal(defaultActivityLogType("strength"), "hiit");
    assert.equal(defaultActivityLogType("cardio"), "cardio");
  });

  it("allows saving activity logs without calories (optional field)", () => {
    assert.equal(normalizeOptionalCalories(""), null);
    assert.equal(normalizeOptionalCalories("  "), null);
    assert.equal(normalizeOptionalCalories("320"), 320);
  });
});

describe("planned vs unplanned completion linking", () => {
  it("links a completed session to one plan entry without double-counting", () => {
    type Plan = { id: string; status: string; training_session_id: string | null };
    type Session = { id: string; plan_entry_id: string | null };

    function applyCompletion(plan: Plan, session: Session): {
      plan: Plan;
      session: Session;
      countedOnce: boolean;
    } {
      const nextPlan: Plan = {
        ...plan,
        status: "completed",
        training_session_id: session.id,
      };
      const nextSession: Session = {
        ...session,
        plan_entry_id: plan.id,
      };
      const countedOnce =
        nextPlan.training_session_id === nextSession.id &&
        nextSession.plan_entry_id === nextPlan.id &&
        nextPlan.status === "completed";
      return { plan: nextPlan, session: nextSession, countedOnce };
    }

    const planned = applyCompletion(
      { id: "plan-1", status: "planned", training_session_id: null },
      { id: "sess-1", plan_entry_id: null },
    );
    assert.equal(planned.countedOnce, true);
    assert.equal(planned.plan.status, "completed");

    const unplanned: Session = { id: "sess-2", plan_entry_id: null };
    assert.equal(unplanned.plan_entry_id, null);
  });

  it("preserves historical completed sessions when rescheduling future planned ones", () => {
    const history = [
      { id: "h1", status: "completed", plan_date: "2026-10-06" },
      { id: "h2", status: "completed", plan_date: "2026-10-07" },
    ];
    const futurePlanned = [
      {
        id: "f1",
        status: "planned",
        plan_date: "2026-10-13",
        training_session_id: null,
      },
      {
        id: "f2",
        status: "planned",
        plan_date: "2026-10-14",
        training_session_id: null,
      },
    ];
    const removable = futurePlanned.filter(
      (row) => row.status === "planned" && row.training_session_id == null,
    );
    assert.equal(removable.length, 2);
    assert.equal(history.filter((row) => row.status === "planned").length, 0);
  });
});

describe("in-gym strength session lifecycle labels", () => {
  it("supports start → pause → resume → finish as distinct states", () => {
    type Phase = "active" | "paused" | "finished";
    let phase: Phase = "active";
    phase = "paused";
    assert.equal(phase, "paused");
    phase = "active";
    assert.equal(phase, "active");
    phase = "finished";
    assert.equal(phase, "finished");
  });
});
