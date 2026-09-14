import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  notificationDateGroup,
  safeNotificationUrl,
  unreadNotificationCount,
  visibleNotifications,
  type UserNotification,
} from "../lib/notifications.ts";

const base: UserNotification = {
  id: "one", user_id: "user", campaign_id: null, type: "jobs_ready_for_review",
  category: "applications", priority: "action_required", title: "Ready", message: "Review",
  status: "unread", action_url: "/dashboard?panel=approve", action_label: "Review jobs",
  metadata: {}, created_at: "2026-09-14T03:00:00.000Z", read_at: null, resolved_at: null, archived_at: null,
};

test("notification deep links accept only allow-listed dashboard panels", () => {
  assert.equal(safeNotificationUrl("/dashboard?panel=approve"), "/dashboard?panel=approve");
  assert.equal(safeNotificationUrl("https://evil.example/dashboard?panel=approve"), null);
  assert.equal(safeNotificationUrl("/dashboard?panel=admin"), null);
  assert.equal(safeNotificationUrl("/tracker"), null);
});

test("unread count excludes archived items", () => {
  assert.equal(unreadNotificationCount([base, { ...base, id: "two", status: "archived", archived_at: "2026-09-14T04:00:00Z" }]), 1);
});

test("attention filter excludes resolved and archived notifications", () => {
  const result = visibleNotifications([base, { ...base, id: "resolved", resolved_at: "2026-09-14T04:00:00Z" }, { ...base, id: "archived", status: "archived" }], "attention");
  assert.deepEqual(result.map((item) => item.id), ["one"]);
});

test("date groups are stable around today", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(notificationDateGroup("2026-09-14T01:00:00Z", now), "Today");
  assert.equal(notificationDateGroup("2026-09-13T01:00:00Z", now), "Yesterday");
  assert.equal(notificationDateGroup("2026-09-10T01:00:00Z", now), "Earlier this week");
  assert.equal(notificationDateGroup("2026-08-01T01:00:00Z", now), "Older");
});

test("notification migration keeps content server-owned and state user-owned", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260913074436_notifications_mvp.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /revoke insert, delete/i);
  assert.match(sql, /grant update \(status, read_at, archived_at\)/i);
  assert.match(sql, /user_notifications_user_dedupe_unique/i);
});
