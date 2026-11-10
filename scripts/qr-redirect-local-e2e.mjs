#!/usr/bin/env node
// Bout en bout LOCAL de la redirection QR avec le vrai serveur Next
// (`next start`, apres `next build`) et l'emulateur Firestore. Aucun service
// distant n'est contacte. A lancer via :
//   firebase --config firebase.emulator.json emulators:exec --project demo-admin-qr-campaigns \
//     --only firestore "node scripts/qr-redirect-local-e2e.mjs"
//
// Verifie : 302 immediat (iPhone, Android, robot, HEAD), comptage effectue
// APRES la reponse par after(), robots ecartes, HEAD non compte, et, avec
// une base injoignable, redirection de secours vers le lien de telechargement.

import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { checkQrRedirect } from "./check-qr-redirect.mjs";

if (!process.env.FIRESTORE_EMULATOR_HOST || !String(process.env.GCLOUD_PROJECT).startsWith("demo-")) {
  throw new Error("Emulateur Firestore et projet demo- obligatoires.");
}
const projectId = process.env.GCLOUD_PROJECT;
const ONELINK = "https://onelink.to/jx4ee7";
const db = getFirestore(initializeApp({ projectId }));
// Compte de service fictif : l'emulateur ne verifie pas les identifiants.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

async function startServer(port, firestoreHost) {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: {
      ...process.env, NODE_ENV: "production", FIRESTORE_EMULATOR_HOST: firestoreHost,
      FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: `local-e2e@${projectId}.iam.gserviceaccount.com`, FIREBASE_PRIVATE_KEY: privateKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/public/qr/zz-warmup`, { redirect: "manual" });
      return { server, output: () => output };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  server.kill();
  throw new Error(`Serveur Next non demarre :\n${output}`);
}

async function counters() {
  const snapshot = await db.collection("qr_campaigns/bus_dunkerque/hourly_stats").get();
  const total = {};
  for (const doc of snapshot.docs) for (const [key, value] of Object.entries(doc.data())) if (typeof value === "number" && !["hour", "shard"].includes(key)) total[key] = (total[key] ?? 0) + value;
  return total;
}

await db.recursiveDelete(db.collection("qr_campaigns"));
await db.recursiveDelete(db.collection("qr_campaign_slugs"));
await db.doc("qr_campaigns/bus_dunkerque").set({ name: "Bus Dunkerque", slug: "bus", destination_url: ONELINK, status: "active", channel: "bus", launch_at: null });
await db.doc("qr_campaign_slugs/bus").set({ campaign_id: "bus_dunkerque", destination_url: ONELINK, status: "active", launch_at: null });

const report = {};
const live = await startServer(3107, process.env.FIRESTORE_EMULATOR_HOST);
try {
  const results = await checkQrRedirect("http://127.0.0.1:3107/api/public/qr/bus", ONELINK);
  report.live = results;
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
  // Le comptage arrive apres la reponse (after()).
  let total = {};
  for (let i = 0; i < 40 && (total.opens ?? 0) < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    total = await counters();
  }
  report.counters = total;
  assert.equal(total.opens, 2);
  assert.equal(total.ios, 1);
  assert.equal(total.android, 1);
  assert.equal(total.excluded_automated, 1);
  assert.equal(total.other ?? 0, 0, "HEAD jamais compte");
  const unknown = await fetch("http://127.0.0.1:3107/api/public/qr/inconnu", { redirect: "manual" });
  assert.equal(unknown.status, 302);
  assert.equal(unknown.headers.get("location"), "https://www.proxiplay.fr/");
  assert.doesNotMatch(live.output(), /127\.0\.0\.1.*Mozilla|Mozilla\/5\.0/, "aucun navigateur journalise");
} finally {
  live.server.kill();
}

// Base injoignable : la redirection ne l'attend pas (repli < 500 ms + marge).
const down = await startServer(3108, "127.0.0.1:9");
try {
  const results = await checkQrRedirect("http://127.0.0.1:3108/api/public/qr/bus", ONELINK);
  report.firestoreDown = results;
  for (const result of results) {
    assert.equal(result.status, 302);
    assert.equal(result.location, ONELINK);
    assert.ok(result.elapsedMs < 2500, `repli trop lent : ${result.elapsedMs} ms`);
  }
} finally {
  down.server.kill();
}
console.log(JSON.stringify(report, null, 2));
console.log("OK : redirection locale verifiee.");
process.exit(0);
