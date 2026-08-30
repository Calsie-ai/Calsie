import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfileChecklist,
  profileStrength,
  profileStrengthLabel,
  type ProfileSignals,
} from "../lib/profileCompletion.ts";

/** Every box ticked — the 100% case. */
const COMPLETE: ProfileSignals = {
  fullName: "Sajan Giri",
  phone: "0400 000 000",
  location: "Sydney NSW",
  avatarUrl: "uid/avatar-1.webp",
  targetRole: "Disability Support Worker",
  profileSummary: "Experienced support worker.",
  skillsCount: 4,
  experienceCount: 2,
  resumeReady: true,
  gmailReady: true,
  hasCampaign: true,
};

test("an empty profile scores 0% and nothing is done", () => {
  const strength = profileStrength(buildProfileChecklist({}));
  assert.equal(strength.done, 0);
  assert.equal(strength.percent, 0);
  assert.equal(strength.campaignReady, false);
  assert.equal(strength.outstanding.length, strength.total);
});

test("a fully filled profile scores 100% and is campaign ready", () => {
  const strength = profileStrength(buildProfileChecklist(COMPLETE));
  assert.equal(strength.percent, 100);
  assert.equal(strength.done, strength.total);
  assert.equal(strength.campaignReady, true);
  assert.deepEqual(strength.missingRequired, []);
  assert.deepEqual(strength.outstanding, []);
});

test("campaignReady tracks exactly the three blocking items", () => {
  // These are the same three prerequisites DashboardWorkspace enforces
  // before it enables Start Campaign.
  const required = buildProfileChecklist({}).filter((item) => item.required).map((item) => item.id);
  assert.deepEqual(required, ["resume", "gmail", "campaign"]);

  const almost = profileStrength(buildProfileChecklist({ ...COMPLETE, gmailReady: false }));
  assert.equal(almost.campaignReady, false);
  assert.deepEqual(almost.missingRequired.map((item) => item.id), ["gmail"]);

  // Optional fields missing must NOT block the campaign.
  const noExtras = profileStrength(buildProfileChecklist({
    resumeReady: true,
    gmailReady: true,
    hasCampaign: true,
  }));
  assert.equal(noExtras.campaignReady, true);
  assert.ok(noExtras.percent < 100, "optional gaps should still reduce the score");
});

test("whitespace-only strings do not count as filled", () => {
  const blank = profileStrength(buildProfileChecklist({
    fullName: "   ",
    phone: "\t",
    location: "\n ",
    avatarUrl: "",
    targetRole: "  ",
    profileSummary: " ",
  }));
  assert.equal(blank.done, 0);
});

test("zero-count list signals are not counted as complete", () => {
  const items = buildProfileChecklist({ skillsCount: 0, experienceCount: 0 });
  assert.equal(items.find((item) => item.id === "skills")?.done, false);
  assert.equal(items.find((item) => item.id === "experience")?.done, false);

  const filled = buildProfileChecklist({ skillsCount: 1, experienceCount: 3 });
  assert.equal(filled.find((item) => item.id === "skills")?.done, true);
  assert.equal(filled.find((item) => item.id === "experience")?.done, true);
});

test("undefined signals are treated as not done, never as errors", () => {
  const items = buildProfileChecklist({});
  assert.equal(items.every((item) => item.done === false), true);
  // Each item must carry the copy the UI renders.
  for (const item of items) {
    assert.ok(item.label.length > 0, `${item.id} has no label`);
    assert.ok(item.hint.length > 0, `${item.id} has no hint`);
    assert.ok(item.panel.length > 0, `${item.id} has no destination panel`);
  }
});

test("checklist ids are unique and blocking items are listed first", () => {
  const items = buildProfileChecklist(COMPLETE);
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate checklist id");

  const lastRequired = items.map((item) => item.required).lastIndexOf(true);
  const firstOptional = items.map((item) => item.required).indexOf(false);
  assert.ok(lastRequired < firstOptional, "required items must come first");
});

test("percent is rounded, and bounded to 0-100", () => {
  const partial = profileStrength(buildProfileChecklist({ resumeReady: true }));
  assert.ok(Number.isInteger(partial.percent));
  assert.ok(partial.percent > 0 && partial.percent < 100);

  assert.equal(profileStrength([]).percent, 0, "an empty checklist must not divide by zero");
});

test("strength labels move through the expected bands", () => {
  assert.equal(profileStrengthLabel(0), "Just started");
  assert.equal(profileStrengthLabel(44), "Just started");
  assert.equal(profileStrengthLabel(45), "Getting there");
  assert.equal(profileStrengthLabel(74), "Getting there");
  assert.equal(profileStrengthLabel(75), "Strong");
  assert.equal(profileStrengthLabel(99), "Strong");
  assert.equal(profileStrengthLabel(100), "Complete");
});

test("destination panels are real dashboard panels", async () => {
  const { DASHBOARD_PANELS } = await import("../lib/dashboardNavigation.ts");
  for (const item of buildProfileChecklist({})) {
    assert.ok(
      (DASHBOARD_PANELS as readonly string[]).includes(item.panel),
      `checklist item "${item.id}" points at unknown panel "${item.panel}"`,
    );
  }
});
