import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPushNotificationTarget,
  formatPushNotificationDelivery,
  getPushNotificationDeliveryCounts,
  isTargetedUserReference,
} from "./lib/firebase/notificationsQueries";

test("single notification uses the FlutterFlow user document path", () => {
  assert.deepEqual(buildPushNotificationTarget("single", "All", "abc123"), {
    target_audience: "All",
    target_user_group: "All",
    user_refs: "users/abc123",
  });
});

test("single notification never adds a double users prefix", () => {
  assert.equal(
    buildPushNotificationTarget("single", "All", "users/abc123").user_refs,
    "users/abc123",
  );
  assert.equal(
    buildPushNotificationTarget("single", "All", "users/users/abc123").user_refs,
    "users/abc123",
  );
});

test("single notification requires a user uid", () => {
  assert.throws(
    () => buildPushNotificationTarget("single", "All", "  "),
    /joueur cible est obligatoire/i,
  );
});

test("all and segment notification targets keep their existing schema", () => {
  assert.deepEqual(buildPushNotificationTarget("all", "All", ""), {
    target_audience: "All",
    target_user_group: "All",
    user_refs: "",
  });
  assert.deepEqual(buildPushNotificationTarget("segment", "inactifs_j30", ""), {
    target_audience: "inactifs_j30",
    target_user_group: "inactifs_j30",
    user_refs: "",
  });
});

test("admin display recognizes a canonical targeted user reference", () => {
  assert.equal(isTargetedUserReference("users/abc123"), true);
  assert.equal(isTargetedUserReference("abc123"), false);
  assert.equal(isTargetedUserReference("users/abc123/extra"), false);
});

test("delivery display prefers FlutterFlow num_sent and num_failed counts", () => {
  const counts = getPushNotificationDeliveryCounts({
    attempted_tokens: 3,
    num_sent: 1,
    num_failed: 2,
  });
  assert.deepEqual(counts, { attempted: 3, sent: 1, failed: 2 });
  assert.equal(formatPushNotificationDelivery(counts.sent, counts.failed, counts.attempted), "1 envoyé · 2 échecs");
});

test("delivery display does not invent a zero sent count for pending notifications", () => {
  const counts = getPushNotificationDeliveryCounts({});
  assert.deepEqual(counts, { attempted: null, sent: null, failed: null });
  assert.equal(formatPushNotificationDelivery(counts.sent, counts.failed, counts.attempted), null);
});

test("delivery display remains compatible with legacy sent counts", () => {
  const counts = getPushNotificationDeliveryCounts({ sent_count: 4, success_count: 5 });
  assert.deepEqual(counts, { attempted: null, sent: 4, failed: null });
  assert.equal(formatPushNotificationDelivery(counts.sent, counts.failed, counts.attempted), "4 envoyés");
});

test("existing automatic notification producer keeps the canonical user reference", () => {
  const source = readFileSync("lib/firebase/adminActions.ts", "utf8");
  assert.match(source, /user_refs:\s*`users\/\$\{userId\}`/);
  assert.match(source, /target_audience:\s*"All"/);
  assert.match(source, /target_user_group:\s*"All"/);
});

test("player page routes an individual notification through the canonical creator", () => {
  const source = readFileSync("app/admin/joueurs/page.tsx", "utf8");
  assert.match(source, /if \(userIds\.length === 1\) \{[\s\S]*?createPushNotification\(\{/);
  assert.match(source, /audienceMode:\s*"single"/);
});
