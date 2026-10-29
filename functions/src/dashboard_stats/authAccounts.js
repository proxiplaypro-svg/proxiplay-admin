/* eslint-disable @typescript-eslint/no-require-imports */
const { parisDayKey } = require("./gameContract");

function dayKeysEnding(referenceDate, days) {
  const end = new Date(`${referenceDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || Number.isNaN(end.getTime())) throw new Error("Invalid reference date");
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(end); day.setUTCDate(end.getUTCDate() - index);
    return day.toISOString().slice(0, 10);
  });
}

function createdDay(record) {
  const value = record?.metadata?.creationTime;
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(milliseconds) ? null : parisDayKey(milliseconds);
}

// Auth has no creation-time query. One bounded list pass is therefore shared
// by yesterday's count and the short reconciliation window.
async function collectNewAccounts({ auth, referenceDate, days = 7, maximumUsers = 10000, pageSize = 1000 }) {
  const keys = dayKeysEnding(referenceDate, days); const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  const wanted = new Set(keys); let pageToken; let scanned = 0; let calls = 0;
  do {
    const remaining = maximumUsers - scanned;
    if (remaining <= 0) return { complete: false, counts: null, scanned, calls, reason: "budget" };
    const page = await auth.listUsers(Math.min(pageSize, remaining), pageToken); calls += 1;
    for (const record of page.users || []) { const day = createdDay(record); if (day && wanted.has(day)) counts[day] += 1; }
    scanned += (page.users || []).length; pageToken = page.pageToken;
    if (!pageToken) return { complete: true, counts, scanned, calls };
  } while (true);
}

module.exports = { dayKeysEnding, createdDay, collectNewAccounts };
