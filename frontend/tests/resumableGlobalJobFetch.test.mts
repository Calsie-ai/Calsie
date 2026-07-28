import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/functions/applix-global-daily-job-fetcher/index.ts", import.meta.url),
  "utf8",
);

test("submits Outscraper work asynchronously", () => {
  assert.match(source, /provider\.searchParams\.set\("async", "true"\)/);
  assert.doesNotMatch(source, /provider\.searchParams\.set\("async", "false"\)/);
});

test("persists the provider request ID before returning", () => {
  assert.match(source, /provider_request_id: requestId/);
  assert.match(source, /status: "provider_processing"/);
  assert.match(source, /action: "provider_submitted"/);
});

test("polls the Outscraper request-results endpoint", () => {
  assert.match(source, /OUTSCRAPER_REQUESTS_URL/);
  assert.match(source, /encodeURIComponent\(requestId\)/);
  assert.match(source, /action: "provider_pending"/);
  assert.match(source, /providerStatus === "success"/);
});

test("normalizes results in bounded batches", () => {
  assert.match(source, /const NORMALIZE_BATCH = 25/);
  assert.match(source, /sourceRows\.slice\(cursor, cursor \+ NORMALIZE_BATCH\)/);
  assert.match(source, /normalization_cursor: nextCursor/);
  assert.match(source, /finished \? "completed" : "normalizing"/);
});

test("continues an existing run outside the 6am submission window", () => {
  assert.match(source, /if \(!run && !force && clock\.hour !== 6\)/);
  assert.match(source, /run\?\.status === "completed"/);
});

test("records failures instead of leaving silent started rows", () => {
  assert.match(source, /status: "needs_attention"/);
  assert.match(source, /error_message: message\.slice\(0, 1000\)/);
  assert.match(source, /last_failure_at/);
});

test("does not send emails from the fetch stage", () => {
  assert.match(source, /sends_emails_now: false/);
});
