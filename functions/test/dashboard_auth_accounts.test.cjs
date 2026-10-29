const test = require("node:test");
const assert = require("node:assert/strict");
const { collectNewAccounts } = require("../src/dashboard_stats/authAccounts");

const user = (creationTime) => ({ metadata: { creationTime } });

test("counts Auth creationTime on Paris civil-day boundaries across DST", async () => {
  const auth = { async listUsers() { return { users: [
    user("2026-03-28T23:00:00.000Z"), user("2026-03-29T21:59:59.999Z"), user("2026-03-29T22:00:00.000Z"),
  ] }; } };
  const result = await collectNewAccounts({ auth, referenceDate: "2026-03-29" });
  assert.equal(result.complete, true); assert.equal(result.counts["2026-03-29"], 2);

  const fall = { async listUsers() { return { users: [
    user("2026-10-24T22:00:00.000Z"), user("2026-10-25T22:59:59.999Z"), user("2026-10-25T23:00:00.000Z"),
  ] }; } };
  assert.equal((await collectNewAccounts({ auth: fall, referenceDate: "2026-10-25" })).counts["2026-10-25"], 2);
});

test("paginates once, reconciles seven days, and never returns a partial count", async () => {
  const calls = []; const auth = { async listUsers(size, token) { calls.push([size, token]); return token ? { users: [user("2026-10-28T10:00:00Z")] } : { users: [user("2026-10-27T10:00:00Z")], pageToken: "next" }; } };
  const result = await collectNewAccounts({ auth, referenceDate: "2026-10-28", pageSize: 1, maximumUsers: 3 });
  assert.deepEqual(calls, [[1, undefined], [1, "next"]]); assert.equal(result.counts["2026-10-27"], 1); assert.equal(result.counts["2026-10-28"], 1);
  const limited = await collectNewAccounts({ auth: { async listUsers() { return { users: [user("2026-10-28T10:00:00Z")], pageToken: "next" }; } }, referenceDate: "2026-10-28", maximumUsers: 1 });
  assert.equal(limited.complete, false); assert.equal(limited.counts, null);
});
