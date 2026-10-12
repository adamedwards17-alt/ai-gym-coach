import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCoachAffirmation } from "@/lib/coach-affirmation";

describe("coach affirmation detection", () => {
  it("accepts clear yes replies", () => {
    assert.equal(isCoachAffirmation("yes"), true);
    assert.equal(isCoachAffirmation("Yes please"), true);
    assert.equal(isCoachAffirmation("sounds good"), true);
    assert.equal(isCoachAffirmation("go ahead"), true);
    assert.equal(isCoachAffirmation("let's do it"), true);
  });

  it("rejects questions and counter-proposals", () => {
    assert.equal(isCoachAffirmation("yes but can we do 3 weeks?"), false);
    assert.equal(isCoachAffirmation("what about dinner?"), false);
    assert.equal(isCoachAffirmation("I think calories are too high"), false);
  });
});
