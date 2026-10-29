/* eslint-disable @typescript-eslint/no-require-imports */
// Usage: node scripts/backfill-dashboard-daily.js --project proxi-play-odzp2e [--write] [--replace]
// Default is dry-run: it only reads and prints, for each of the 30 last closed
// Paris days, the recomputed counts, the stored ones and the planned action.
// --write stores missing days only; existing different values are kept unless
// --replace is also given (the previous values are then kept in `replaced`).
// Days written by the nightly consolidation are never replaced.
// The script only ever writes analytics_daily/{YYYY-MM-DD}.
const admin = require("firebase-admin");
const { runBackfill } = require("./lib/dashboardDailyBackfill");

const write = process.argv.includes("--write");
const replace = process.argv.includes("--replace");
const projectIndex = process.argv.indexOf("--project");
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : undefined;
if (!projectId) throw new Error("Pass --project <project-id>.");
if (replace && !write) throw new Error("--replace requires --write.");
if (!admin.apps.length) admin.initializeApp({ projectId });

runBackfill({ db: admin.firestore(), documentId: admin.firestore.FieldPath.documentId(), write, replace })
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error) => { console.error(error.stack || error.message); process.exit(1); });
