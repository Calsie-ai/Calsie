import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoAdvance, slideLabel, stepIndex, wrapIndex } from "../lib/carousel.ts";

test("wraps indexes inside the list", () => {
  assert.equal(wrapIndex(0, 5), 0);
  assert.equal(wrapIndex(4, 5), 4);
  assert.equal(wrapIndex(5, 5), 0);
  assert.equal(wrapIndex(7, 5), 2);
});

test("wraps negative indexes forward, not to a negative slot", () => {
  assert.equal(wrapIndex(-1, 5), 4);
  assert.equal(wrapIndex(-5, 5), 0);
  assert.equal(wrapIndex(-6, 5), 4);
});

test("an empty or nonsense list never produces an out-of-range index", () => {
  for (const length of [0, -3, NaN, Infinity]) {
    assert.equal(wrapIndex(2, length), 0, `length ${length}`);
  }
  assert.equal(wrapIndex(NaN, 5), 0);
  assert.equal(wrapIndex(Infinity, 5), 0);
});

test("stepping forward and back wraps at both ends", () => {
  assert.equal(stepIndex(0, 3, 1), 1);
  assert.equal(stepIndex(2, 3, 1), 0, "last slide wraps to first");
  assert.equal(stepIndex(0, 3, -1), 2, "first slide wraps to last");
  assert.equal(stepIndex(1, 3, -1), 0);
  assert.equal(stepIndex(0, 0, 1), 0, "empty list stays at 0");
});

test("a full cycle of steps returns to the start", () => {
  let index = 0;
  for (let i = 0; i < 5; i += 1) index = stepIndex(index, 5, 1);
  assert.equal(index, 0);
});

test("auto-advance runs only when there is something to rotate to", () => {
  const base = { slideCount: 4, interacting: false, reducedMotion: false };
  assert.equal(shouldAutoAdvance(base), true);
  assert.equal(shouldAutoAdvance({ ...base, slideCount: 1 }), false, "one slide must not rotate");
  assert.equal(shouldAutoAdvance({ ...base, slideCount: 0 }), false);
});

test("auto-advance stops while the user is interacting", () => {
  const base = { slideCount: 4, interacting: true, reducedMotion: false };
  assert.equal(shouldAutoAdvance(base), false, "hover/focus must pause it");
});

test("auto-advance respects reduced motion", () => {
  assert.equal(
    shouldAutoAdvance({ slideCount: 4, interacting: false, reducedMotion: true }),
    false,
    "an OS reduced-motion preference must stop the automatic movement",
  );
});

test("an explicit pause wins over an otherwise-running carousel", () => {
  assert.equal(shouldAutoAdvance({ slideCount: 4, interacting: false, reducedMotion: false, paused: true }), false);
  assert.equal(shouldAutoAdvance({ slideCount: 4, interacting: false, reducedMotion: false, paused: false }), true);
});

test("slide labels are 1-based and safe for an empty list", () => {
  assert.equal(slideLabel(0, 3), "Slide 1 of 3");
  assert.equal(slideLabel(2, 3), "Slide 3 of 3");
  assert.equal(slideLabel(5, 3), "Slide 3 of 3", "an out-of-range index is wrapped, not printed raw");
  assert.equal(slideLabel(0, 0), "No templates");
});
