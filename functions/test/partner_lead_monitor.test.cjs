const test = require("node:test");
const assert = require("node:assert/strict");
const { reportFailedPartnerLeads, summarizeFailedLeads } = require("../src/partner_lead_monitor");

const NOW = new Date("2026-11-02T07:00:00.000Z");

function fakeDb(docs, queries) {
  const query = {
    where(field, op, value) { queries.push({ field, op, value }); return query; },
    select(...fields) { queries.push({ select: fields }); return query; },
    async get() { return { docs: docs.map((doc) => ({ id: doc.id, get: (field) => doc[field] })) }; },
  };
  return { collection(name) { queries.push({ collection: name }); return query; } };
}

function fakeLogger() {
  const entries = [];
  return { entries, error: (message, data) => entries.push({ level: "error", message, data }), info: (message, data) => entries.push({ level: "info", message, data }) };
}

test("summarizeFailedLeads ne retient que email_failed", () => {
  assert.deepEqual(
    summarizeFailedLeads([{ id: "a", status: "emailed" }, { id: "b", status: "email_failed" }, { id: "c", status: "received" }]),
    { total: 3, failedCount: 1, failedLeadIds: ["b"] },
  );
});

test("échecs dans les 24 h : un journal ERROR structuré avec les identifiants", async () => {
  const queries = [];
  const logger = fakeLogger();
  const summary = await reportFailedPartnerLeads({
    db: fakeDb([{ id: "l1", status: "email_failed", email: "x@example.invalid" }, { id: "l2", status: "emailed" }, { id: "l3", status: "email_failed" }], queries),
    logger,
    now: () => NOW,
  });
  assert.equal(summary.failedCount, 2);
  assert.deepEqual(queries.slice(0, 3), [
    { collection: "partner_leads" },
    { field: "createdAt", op: ">=", value: new Date("2026-11-01T07:00:00.000Z") },
    { select: ["status"] },
  ]);
  assert.deepEqual(logger.entries, [{
    level: "error",
    message: "Partner lead failure",
    data: { reason: "email_failed_daily", count: 2, leadIds: ["l1", "l3"], since: "2026-11-01T07:00:00.000Z" },
  }]);
  assert.ok(!JSON.stringify(logger.entries).includes("example.invalid"), "aucune donnée personnelle");
});

test("aucun échec : journal INFO seulement", async () => {
  const logger = fakeLogger();
  await reportFailedPartnerLeads({ db: fakeDb([{ id: "l1", status: "emailed" }], []), logger, now: () => NOW });
  assert.deepEqual(logger.entries.map((entry) => entry.level), ["info"]);
  assert.equal(logger.entries[0].data.failedCount, 0);
});
