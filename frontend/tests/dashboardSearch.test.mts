import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_PANELS } from "../lib/dashboardNavigation.ts";
import {
  DASHBOARD_PAGE_ITEMS,
  DASHBOARD_SECTION_ITEMS,
  SEARCH_RESULT_LIMIT,
  searchDashboard,
  type SearchItem,
} from "../lib/dashboardSearch.ts";

const ALL: SearchItem[] = [...DASHBOARD_PAGE_ITEMS, ...DASHBOARD_SECTION_ITEMS];

function labels(query: string, items: SearchItem[] = ALL) {
  return searchDashboard(query, items).map((item) => item.label);
}

test("a blank query returns nothing rather than every item", () => {
  assert.deepEqual(searchDashboard("", ALL), []);
  assert.deepEqual(searchDashboard("   ", ALL), []);
  assert.deepEqual(searchDashboard("\t\n", ALL), []);
});

test("every dashboard panel is reachable from search", () => {
  // Guards the real regression risk: someone adds a panel to
  // DASHBOARD_PANELS but forgets to make it findable.
  for (const panel of DASHBOARD_PANELS) {
    const item = DASHBOARD_PAGE_ITEMS.find((entry) => entry.panel === panel);
    assert.ok(item, `no search entry for panel "${panel}"`);
    const found = searchDashboard(item.label, ALL).some((entry) => entry.panel === panel);
    assert.ok(found, `searching "${item.label}" did not surface panel "${panel}"`);
  }
});

test("page items cover exactly the canonical panel list", () => {
  assert.equal(DASHBOARD_PAGE_ITEMS.length, DASHBOARD_PANELS.length);
  const panels = DASHBOARD_PAGE_ITEMS.map((item) => item.panel).sort();
  assert.deepEqual(panels, [...DASHBOARD_PANELS].sort());
});

test("item ids are unique", () => {
  const ids = ALL.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate search item id");
});

test("matching is case-insensitive", () => {
  assert.deepEqual(labels("GMAIL"), labels("gmail"));
  assert.deepEqual(labels("Build Resume"), labels("build resume"));
});

test("an exact label match outranks a mere substring match", () => {
  const results = searchDashboard("skills", ALL);
  assert.equal(results[0].label, "Skills");
});

test("a whole-label match ranks that item first", () => {
  assert.equal(searchDashboard("overview", ALL)[0].panel, "overview");
  assert.equal(searchDashboard("application tracker", ALL)[0].panel, "tracker");
});

test("keywords match terms that are absent from the label", () => {
  // "cv" appears in no label, only in keywords.
  const cv = searchDashboard("cv", ALL);
  assert.ok(cv.length > 0, "expected keyword-only term to match");
  assert.ok(cv.some((item) => item.panel === "resume" || item.panel === "buildResume"));

  // Someone looking for OAuth should land on the Gmail panel.
  assert.ok(searchDashboard("oauth", ALL).some((item) => item.panel === "gmail"));
  // American spelling of licence.
  assert.ok(searchDashboard("license", ALL).some((item) => item.panel === "buildResume"));
});

test("results are capped at the configured limit", () => {
  // "e" appears across a great many labels/keywords.
  assert.ok(searchDashboard("e", ALL).length <= SEARCH_RESULT_LIMIT);
  assert.ok(searchDashboard("a", ALL, 3).length <= 3);
});

test("a query matching nothing returns an empty list", () => {
  assert.deepEqual(searchDashboard("zzzzqqqq", ALL), []);
});

test("accented input matches unaccented labels", () => {
  assert.ok(searchDashboard("rôle", ALL).some((item) => item.label === "Target Role"));
});

test("template items are searchable by title and role", () => {
  const templates: SearchItem[] = [{
    id: "template:aged-care",
    kind: "template",
    label: "AgeCare",
    sublabel: "Aged Care Worker",
    keywords: ["aged care", "support worker"],
    panel: "templates",
    templateSlug: "aged-care",
  }];
  const items = [...ALL, ...templates];
  assert.equal(searchDashboard("agecare", items)[0].templateSlug, "aged-care");
  assert.ok(searchDashboard("aged care", items).some((item) => item.kind === "template"));
});

test("ties are broken by declaration order, so results are stable", () => {
  const a = searchDashboard("resume", ALL).map((item) => item.id);
  const b = searchDashboard("resume", ALL).map((item) => item.id);
  assert.deepEqual(a, b);
});
