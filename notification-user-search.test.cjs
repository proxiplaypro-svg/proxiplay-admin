/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const {
  buildUserSearchIndex,
  normalizeSearchText,
  MAX_SEARCH_TERMS_PER_USER,
} = require("./functions/src/user_search_index");

test("notification user search index supports partial name, email, phone and uid matches", () => {
  const index = buildUserSearchIndex("uid-marie-menu-42", {
    first_name: "Emmanuelle",
    last_name: "Dupont",
    email: "marie@example.fr",
    phone_number: "06 12 34 56 78",
  });

  for (const term of ["emma", "manu", "dup", "example", "1234", "uid marie", "ÉMMA"]) {
    assert.ok(index.search_terms.includes(normalizeSearchText(term)), term);
  }
  assert.ok(!index.search_terms.includes("menu"), "menu is not a substring of Emmanuelle");
  assert.equal(index.phone, "06 12 34 56 78");
});

test("notification user search index stays within its documented worst-case bound", () => {
  const index = buildUserSearchIndex("z".repeat(64), {
    display_name: "a".repeat(32),
    full_name: "b".repeat(32),
    name: "c".repeat(32),
    pseudo: "d".repeat(32),
    first_name: "e".repeat(32),
    last_name: "f".repeat(32),
    email: "g".repeat(32) + "." + "h".repeat(32) + "." + "i".repeat(32) + "." + "j".repeat(32) + "." + "k".repeat(32),
    phone_number: "1".repeat(64),
  });
  assert.ok(index.search_terms.length <= MAX_SEARCH_TERMS_PER_USER);
  assert.equal(MAX_SEARCH_TERMS_PER_USER, 3384);
});

test("notification user search index has no FCM field or eligibility filter", () => {
  const index = buildUserSearchIndex("uid-no-push", { email: "sans-push@example.fr" });
  assert.ok(index.search_terms.includes("sans"));
  assert.ok(!Object.hasOwn(index, "fcmToken"));
  assert.ok(!Object.hasOwn(index, "pushAvailable"));
  const functionsSource = readFileSync("functions/index.js", "utf8");
  assert.doesNotMatch(functionsSource, /onUserFcmTokenWritten/);
});

test("notification search queries the complete index, not an arbitrary first users page", () => {
  const source = readFileSync("lib/firebase/notificationsQueries.ts", "utf8");
  assert.match(source, /collection\(db, "user_search_index"\), where\("search_terms", "array-contains", normalized\), limit\(10\)/);
  assert.doesNotMatch(source, /searchNotificationUsers[\s\S]*collection\(db, "users"\), limit\(80\)/);
});
