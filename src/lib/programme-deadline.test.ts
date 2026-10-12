import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkProgrammeFitsDeadline,
  scheduleProgrammePhases,
  suggestPhasesForDeadline,
  weeksRemainingUntil,
} from "@/lib/programme-deadline";

describe("programme deadline awareness", () => {
  it("counts whole weeks until the target date", () => {
    // 10 Dec 2025 from 9 Oct 2025 ≈ 8 weeks
    assert.equal(weeksRemainingUntil("2025-10-09", "2025-12-10"), 8);
  });

  it("flags a 6+4 week stack that overruns an 8-week deadline", () => {
    const fit = checkProgrammeFitsDeadline({
      todayIso: "2025-10-09",
      targetDateIso: "2025-12-10",
      phases: [
        { durationWeeks: 6, status: "active" },
        { durationWeeks: 4, status: "upcoming" },
      ],
    });
    assert.equal(fit.status, "overflow");
    if (fit.status === "overflow") {
      assert.equal(fit.weeksRequired, 10);
      assert.equal(fit.weeksAvailable, 8);
      assert.equal(fit.shortfallWeeks, 2);
    }
  });

  it("schedules sequential phase dates from an anchor", () => {
    const scheduled = scheduleProgrammePhases({
      anchorStartIso: "2025-10-09",
      phases: [
        {
          name: "Muscle building",
          kind: "muscle_building",
          status: "active",
          durationWeeks: 4,
          sortOrder: 0,
        },
        {
          name: "Fat loss",
          kind: "fat_loss",
          status: "upcoming",
          durationWeeks: 4,
          sortOrder: 1,
        },
      ],
    });
    assert.equal(scheduled[0].startDate, "2025-10-09");
    assert.equal(scheduled[0].endDate, "2025-11-05");
    assert.equal(scheduled[1].startDate, "2025-11-06");
    assert.equal(scheduled[1].endDate, "2025-12-03");
  });

  it("suggests a shortened stack that fits the deadline", () => {
    const suggested = suggestPhasesForDeadline({
      todayIso: "2025-10-09",
      targetDateIso: "2025-12-10",
      phases: [
        {
          name: "Muscle building (6 weeks)",
          kind: "muscle_building",
          status: "active",
          durationWeeks: 6,
          sortOrder: 0,
        },
        {
          name: "Fat loss (4 weeks)",
          kind: "fat_loss",
          status: "upcoming",
          durationWeeks: 4,
          sortOrder: 1,
        },
      ],
    });
    assert.ok(suggested);
    const total = suggested!.reduce((sum, p) => sum + p.durationWeeks, 0);
    assert.ok(total <= 8);
    assert.equal(suggested![0].durationWeeks, 6);
    assert.equal(suggested![1].durationWeeks, 2);
  });
});
