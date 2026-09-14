"use strict";
// Read-only toward the mobile repository: produce an applicable patch and an
// exact handler fixture in this repository. No backend export is added here.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/prepare-prize-merchant-patch.cjs <mobile firebase/functions/index.js>");
const original = fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n");
const start = original.indexOf("exports.notifyPrizeWon = functions");
const next = original.indexOf("\nexports.", start + 1);
if (start < 0 || next < 0) throw new Error("notifyPrizeWon export not found");
const block = original.slice(start, next);
const marker = "    if (!merchantEmailDone) {";
if (block.split(marker).length !== 2) throw new Error("Expected one merchant email block");
const guard = [
  "    // Operational merchant email only: preserve all player/push processing.",
  "    const merchantEmailPolicy = !merchantEmailDone",
  "      ? await resolvePrizeMerchantEmailPolicy(firestore, prizeData, gameData)",
  "      : null;",
  "    if (merchantEmailPolicy?.skipped) {",
  "      updates.merchant_email_skipped = true;",
  "      updates.merchant_email_skip_reason = merchantEmailPolicy.reason;",
  "    }",
  "",
  "    if (!merchantEmailDone && !merchantEmailPolicy?.skipped) {",
].join("\n");
const patchedBlock = block.replace(marker, guard);
const modified = original.slice(0, start) + patchedBlock + original.slice(next);
const importLine = 'const { resolvePrizeMerchantEmailPolicy } = require("./src/prize_merchant_email_policy");\n';
const finalSource = importLine + modified;
const output = path.resolve("docs/backend-patches");
fs.mkdirSync(output, { recursive: true });
const before = path.join(output, ".before-index.js");
const after = path.join(output, ".after-index.js");
fs.writeFileSync(before, original);
fs.writeFileSync(after, finalSource);
const diff = spawnSync("git", ["diff", "--no-index", "--no-prefix", "--", before, after], { encoding: "utf8" });
if (![0, 1].includes(diff.status)) throw new Error(diff.stderr);
let patch = diff.stdout.replace(/^diff --git .+$/m, "diff --git a/firebase/functions/index.js b/firebase/functions/index.js")
  .replace(/^--- .+$/m, "--- a/firebase/functions/index.js")
  .replace(/^\+\+\+ .+$/m, "+++ b/firebase/functions/index.js");
const policy = fs.readFileSync("functions/src/prize_merchant_email_policy.js", "utf8").replace(/\r\n/g, "\n").trimEnd();
patch += `diff --git a/firebase/functions/src/prize_merchant_email_policy.js b/firebase/functions/src/prize_merchant_email_policy.js\nnew file mode 100644\n--- /dev/null\n+++ b/firebase/functions/src/prize_merchant_email_policy.js\n@@ -0,0 +1,${policy.split("\n").length} @@\n${policy.split("\n").map(line => `+${line}`).join("\n")}\n`;
// Git accepts an empty context line without its optional leading space.
// Avoid trailing whitespace when storing the patch itself in this repository.
fs.writeFileSync(path.join(output, "notify-prize-managed-by-admin.patch"), patch.replace(/^ $/gm, ""));
fs.mkdirSync("functions/test/fixtures", { recursive: true });
// Keep only the exact onCreate callback, not unrelated exports or configuration.
const callbackStart = block.indexOf(".onCreate(async (snapshot, context) => {");
const callbackEnd = block.indexOf("\n  });", callbackStart);
if (callbackStart < 0 || callbackEnd < 0) throw new Error("Cannot isolate callback");
const exactBlock = block.slice(0, callbackEnd + "\n  });".length);
fs.writeFileSync("functions/test/fixtures/notify-prize-won.original.txt", exactBlock);
fs.unlinkSync(before); fs.unlinkSync(after);
console.log("Patch backend et fixture préparés ; dépôt source inchangé.");
