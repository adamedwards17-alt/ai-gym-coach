import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyCoachLoadingIntent,
  getCoachLoadingMessage,
} from "@/lib/coach-loading";

describe("coach loading messages", () => {
  it("maps calorie questions", () => {
    assert.equal(
      classifyCoachLoadingIntent("What should my calorie target be?"),
      "calories",
    );
    assert.match(
      getCoachLoadingMessage("What should my calorie target be?"),
      /calorie/i,
    );
  });

  it("maps training programme questions", () => {
    assert.equal(
      classifyCoachLoadingIntent("Can we change my training programme?"),
      "training_plan",
    );
  });

  it("maps workout review questions", () => {
    assert.equal(
      classifyCoachLoadingIntent("How did my last workout compare?"),
      "workout_review",
    );
  });

  it("maps food questions", () => {
    assert.equal(
      classifyCoachLoadingIntent("What should I eat for dinner?"),
      "food",
    );
  });

  it("maps terminology questions", () => {
    assert.equal(
      classifyCoachLoadingIntent("What does recomp mean?"),
      "terminology",
    );
    assert.match(
      getCoachLoadingMessage("What does recomp mean?"),
      /plain English/i,
    );
  });

  it("falls back for ambiguous questions", () => {
    assert.equal(classifyCoachLoadingIntent("Hmm"), "general");
    assert.equal(
      getCoachLoadingMessage("Hmm"),
      "Thinking that through…",
    );
  });
});
