import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PANELS,
  canonicalDashboardPanelPath,
  dashboardPanelPath,
  dashboardPathAfterProcessing,
  parseDashboardPanel,
} from "../lib/dashboardNavigation.ts";
import { loginPathFor, safeInternalPath } from "../lib/navigation.ts";

function params(path: string) {
  return new URL(path, "https://applix.invalid").searchParams;
}

function panelFromPath(path: string) {
  return parseDashboardPanel(params(path).get("panel"));
}

class MemoryHistory {
  entries = ["/dashboard?panel=overview"];
  index = 0;

  push(path: string) {
    this.entries.splice(this.index + 1);
    this.entries.push(path);
    this.index = this.entries.length - 1;
  }

  back() {
    if (this.index > 0) this.index -= 1;
    return this.entries[this.index];
  }

  forward() {
    if (this.index < this.entries.length - 1) this.index += 1;
    return this.entries[this.index];
  }

  current() {
    return this.entries[this.index];
  }
}

test("missing panel defaults to overview", () => {
  assert.equal(parseDashboardPanel(null), "overview");
  assert.equal(panelFromPath("/dashboard"), "overview");
  assert.equal(
    canonicalDashboardPanelPath(params("/dashboard")),
    "/dashboard?panel=overview",
  );
});

test("every supported panel parses correctly", () => {
  for (const panel of DASHBOARD_PANELS) {
    assert.equal(parseDashboardPanel(panel), panel);
  }
});

test("invalid panel falls back safely", () => {
  assert.equal(parseDashboardPanel("billing"), "overview");
  assert.equal(
    canonicalDashboardPanelPath(params("/dashboard?panel=billing")),
    "/dashboard?panel=overview",
  );
});

test("sidebar navigation updates the dashboard URL", () => {
  const history = new MemoryHistory();
  history.push(dashboardPanelPath("templates", params(history.current())));
  assert.equal(history.current(), "/dashboard?panel=templates");
  assert.equal(panelFromPath(history.current()), "templates");
});

test("Back restores the previous panel", () => {
  const history = new MemoryHistory();
  history.push(dashboardPanelPath("templates", params(history.current())));
  history.push(dashboardPanelPath("tracker", params(history.current())));
  assert.equal(panelFromPath(history.back()), "templates");
});

test("Forward restores the next panel", () => {
  const history = new MemoryHistory();
  history.push(dashboardPanelPath("templates", params(history.current())));
  history.push(dashboardPanelPath("tracker", params(history.current())));
  history.back();
  assert.equal(panelFromPath(history.forward()), "tracker");
});

test("refresh preserves the panel encoded in the URL", () => {
  const locationBeforeRefresh = "/dashboard?panel=approve";
  assert.equal(panelFromPath(locationBeforeRefresh), "approve");
  assert.equal(panelFromPath(locationBeforeRefresh), "approve");
});

test("login return preserves the exact dashboard panel", () => {
  const returnPath = "/dashboard?panel=resume";
  const loginPath = loginPathFor(returnPath);
  assert.equal(loginPath, "/login?next=%2Fdashboard%3Fpanel%3Dresume");
  assert.equal(
    safeInternalPath(params(loginPath).get("next")),
    returnPath,
  );
});

test("Stage 2 restoreIntent opens the templates panel", () => {
  const path = dashboardPanelPath(
    "templates",
    params("/dashboard?restoreIntent=1"),
  );
  assert.equal(path, "/dashboard?panel=templates&restoreIntent=1");
  assert.equal(panelFromPath(path), "templates");
});

test("Gmail return preserves the gmail panel", () => {
  const returnPath = dashboardPanelPath("gmail");
  assert.equal(returnPath, "/dashboard?panel=gmail");
  assert.equal(panelFromPath(returnPath), "gmail");
});

test("payment return deliberately selects templates and keeps status until verification", () => {
  const paymentReturn = dashboardPanelPath(
    "templates",
    params("/dashboard?payment=success&session_id=cs_test_12345678&template=child-care&postcode=2141"),
  );
  assert.equal(panelFromPath(paymentReturn), "templates");
  assert.equal(params(paymentReturn).get("payment"), "success");
  assert.equal(params(paymentReturn).get("session_id"), "cs_test_12345678");
});

test("tracker action opens the tracker panel", () => {
  const path = dashboardPanelPath("tracker", params("/dashboard?panel=overview"));
  assert.equal(path, "/dashboard?panel=tracker");
});

test("a canonical dashboard URL does not trigger a replace loop", () => {
  assert.equal(
    canonicalDashboardPanelPath(params("/dashboard?panel=campaign")),
    null,
  );
});

test("safe unrelated query parameters are retained and unknown values are not copied", () => {
  const path = dashboardPanelPath(
    "templates",
    params("/dashboard?panel=overview&restoreIntent=1&template=child-care&postcode=2141&payment=success&session_id=cs_test_12345678&access_token=secret"),
  );
  assert.equal(
    path,
    "/dashboard?panel=templates&restoreIntent=1&payment=success&session_id=cs_test_12345678&template=child-care&postcode=2141",
  );
  assert.equal(params(path).has("access_token"), false);
});

test("one-time parameters are removed only after processing", () => {
  const current = params("/dashboard?panel=templates&restoreIntent=1&template=child-care&postcode=2141");
  assert.equal(
    dashboardPathAfterProcessing("templates", current, false, ["restoreIntent", "template", "postcode"]),
    null,
  );
  assert.equal(
    dashboardPathAfterProcessing("templates", current, true, ["restoreIntent", "template", "postcode"]),
    "/dashboard?panel=templates",
  );
});
