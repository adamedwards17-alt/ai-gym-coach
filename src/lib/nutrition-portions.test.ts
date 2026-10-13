import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePortions,
  scaleLoggedMacrosForPortions,
} from "@/lib/nutrition-portions";

describe("logged entry portion editing", () => {
  const baseMacros = {
    calories: 280,
    proteinG: 7,
    carbsG: 42,
    fatG: 9,
  };

  it("doubles macros when portions go from 1 to 2", () => {
    const next = scaleLoggedMacrosForPortions({
      macros: baseMacros,
      currentPortions: 1,
      nextPortions: 2,
    });
    assert.deepEqual(next, {
      calories: 560,
      proteinG: 14,
      carbsG: 84,
      fatG: 18,
    });
  });

  it("halves macros when portions go from 2 to 1 without double-scaling", () => {
    const atTwo = scaleLoggedMacrosForPortions({
      macros: baseMacros,
      currentPortions: 1,
      nextPortions: 2,
    });
    const back = scaleLoggedMacrosForPortions({
      macros: atTwo,
      currentPortions: 2,
      nextPortions: 1,
    });
    assert.deepEqual(back, baseMacros);
  });

  it("supports fractional portions", () => {
    const next = scaleLoggedMacrosForPortions({
      macros: baseMacros,
      currentPortions: 1,
      nextPortions: 1.5,
    });
    assert.equal(next.calories, 420);
    assert.equal(next.proteinG, 10.5);
  });

  it("preserves macros when portions unchanged after a manual edit", () => {
    const manual = { calories: 310, proteinG: 8, carbsG: 40, fatG: 10 };
    const next = scaleLoggedMacrosForPortions({
      macros: manual,
      currentPortions: 1,
      nextPortions: 1,
    });
    assert.deepEqual(next, manual);
  });

  it("normalizes invalid portions to 1", () => {
    assert.equal(normalizePortions(null), 1);
    assert.equal(normalizePortions(0), 1);
    assert.equal(normalizePortions(2.55), 2.6);
  });
});
