import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseNutritionProposalPayload,
  parseProgrammeProposalPayload,
  describeCoachChangeProposal,
} from "@/lib/coach-change-proposals";
import { parseCoachChatResponse } from "@/lib/coach";

describe("coach change proposal parsing", () => {
  it("parses nutrition proposals and marks them manual by default", () => {
    const payload = parseNutritionProposalPayload({
      dailyCalories: 2100,
      proteinG: 160,
      carbsG: 200,
      fatG: 70,
    });
    assert.ok(payload);
    assert.equal(payload!.setManual, true);
    assert.equal(payload!.dailyCalories, 2100);
  });

  it("parses programme phase proposals", () => {
    const payload = parseProgrammeProposalPayload({
      phases: [
        { slug: "hypertrophy-6wk", durationWeeks: 4, status: "active" },
        { slug: "fat-loss-4wk", durationWeeks: 4, status: "upcoming" },
      ],
      anchorDate: "2025-10-09",
    });
    assert.ok(payload);
    assert.equal(payload!.phases.length, 2);
    assert.equal(payload!.phases[0].durationWeeks, 4);
  });

  it("extracts proposals from structured coach JSON without applying them", () => {
    const parsed = parseCoachChatResponse(
      JSON.stringify({
        reply: "I can shorten the muscle-building phase to 4 weeks.",
        events: [],
        nutrition_proposal: {
          reason: "Lower calories as discussed",
          dailyCalories: 2000,
          proteinG: 160,
          carbsG: 180,
          fatG: 65,
          setManual: true,
        },
        programme_proposal: {
          reason: "Fit the 10 December deadline",
          phases: [
            { slug: "hypertrophy-6wk", durationWeeks: 4, name: "Muscle building (4 weeks)" },
            { slug: "fat-loss-4wk", durationWeeks: 4, name: "Fat loss (4 weeks)" },
          ],
        },
      }),
      "2025-10-09",
    );
    assert.equal(parsed.structured, true);
    assert.ok(parsed.nutritionProposal);
    assert.ok(parsed.programmeProposal);
    assert.equal(parsed.planProposal, null);
  });

  it("describes nutrition proposals for the confirmation card", () => {
    const lines = describeCoachChangeProposal({
      id: "x",
      conversation_id: null,
      kind: "nutrition_targets",
      status: "pending",
      reason: "Agreed lower target",
      payload: {
        dailyCalories: 2000,
        proteinG: 160,
        carbsG: 180,
        fatG: 65,
        setManual: true,
      },
      created_at: new Date().toISOString(),
      resolved_at: null,
    });
    assert.ok(lines.some((line) => /2000 kcal/.test(line)));
    assert.ok(lines.some((line) => /manual/.test(line)));
  });
});
