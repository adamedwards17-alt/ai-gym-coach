import assert from "node:assert/strict";
import test from "node:test";
import { splitCoachRecommendations } from "./coach-recommendations";

test("splits a coach bullet list into recommendation cards", () => {
  const parsed = splitCoachRecommendations(
    "About 700 calories left.\n- Chicken rice bowl — greens and soy\n- Greek yogurt — if you want something lighter\nWhich sounds better?",
  );
  assert.ok(parsed);
  assert.equal(parsed.lead, "About 700 calories left.");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0]?.title, "Chicken rice bowl");
  assert.equal(parsed.items[0]?.detail, "greens and soy");
  assert.equal(parsed.closing, "Which sounds better?");
});

test("leaves ordinary replies as plain messages", () => {
  assert.equal(
    splitCoachRecommendations("Keep the chicken and add greens."),
    null,
  );
});
