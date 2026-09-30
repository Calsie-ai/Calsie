import assert from "node:assert/strict";
import test from "node:test";
import { postedLabel, swipeAction } from "../lib/jobSwipe.ts";
import { matchesLocation, plainDescription } from "../../supabase/jobs/functions/calsie-agent-feed/feedRules.ts";

test("deliberate left/right/up gestures use the requested actions", () => {
  assert.equal(swipeAction(-100, 12), "approved");
  assert.equal(swipeAction(100, -12), "skipped");
  assert.equal(swipeAction(10, -90), "details");
  for (const [x,y] of [[0,0],[25,-10],[-65,5],[75,75],[0,80]]) assert.equal(swipeAction(x,y), null);
});
test("missing dates do not become fictional recent postings", () => {
  assert.equal(postedLabel(null), "Not listed");
  assert.equal(postedLabel("invalid"), "Not listed");
  assert.equal(postedLabel("2026-09-28T12:00:00Z", Date.parse("2026-09-30T12:00:00Z")), "2 days ago");
});
test("Australia includes the pool, postcode preferences filter state with aliases", () => {
  assert.equal(matchesLocation(null, "Australia"), true);
  assert.equal(matchesLocation("Penrith, NSW, AU", "Greater Sydney · NSW 2141"), true);
  assert.equal(matchesLocation("Orange, New South Wales", "NSW 2800"), true);
  assert.equal(matchesLocation("Melbourne VIC", "Greater Sydney · NSW 2141"), false);
  assert.equal(matchesLocation(null, "NSW 2141"), false);
  assert.equal(matchesLocation("Adelaide, South Australia", "SA 5000"), true);
});
test("city preferences match words without arbitrary substring matching", () => {
  assert.equal(matchesLocation("Sydney, NSW, AU", "Sydney NSW"), true);
  assert.equal(matchesLocation("Newcastle NSW", "Sydney NSW"), false);
  assert.equal(matchesLocation("Sydney NSW", "QLD"), false);
  assert.equal(matchesLocation("Sydney NSW", "%"), false);
});
test("job descriptions become readable text without executing source HTML", () => {
  assert.equal(plainDescription('<p>Care &amp; support</p><script>bad()</script><p>Apply now</p>'), "Care & support\nApply now");
  assert.equal(plainDescription(null), null);
});
