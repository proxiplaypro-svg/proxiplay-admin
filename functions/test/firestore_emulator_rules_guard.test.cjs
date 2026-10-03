#!/usr/bin/env node

// Garde-fou : empeche qu'un futur changement remette silencieusement
// l'emulateur Firestore local en mode permissif ("allow all reads and
// writes"), ce qui ferait passer des tests sans jamais verifier de
// vraies permissions -- exactement le risque identifie quand
// `firebase.json` de ce repo a ete prive de sa cle "firestore.rules"
// pour l'empecher de republier les regles en production (voir
// firebase.json / firebase.emulator.json).
//
//   firebase --config firebase.emulator.json emulators:exec \
//     --only firestore,auth \
//     "node --test functions/test/firestore_emulator_rules_guard.test.cjs"

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const emulatorConfigPath = path.join(repoRoot, "firebase.emulator.json");
const productionConfigPath = path.join(repoRoot, "firebase.json");

test("firebase.emulator.json reference bien firestore.rules pour l'emulateur", () => {
  const config = JSON.parse(fs.readFileSync(emulatorConfigPath, "utf8"));
  assert.equal(
    config.firestore && config.firestore.rules,
    "firestore.rules",
    "firebase.emulator.json doit declarer firestore.rules comme regles Firestore " +
      "pour que l'emulateur applique reellement les permissions pendant les tests",
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, config.firestore.rules)),
    `le fichier de regles reference (${config.firestore.rules}) doit exister sur disque`,
  );
});

test("firebase.json (production) ne declare plus de regles Firestore deployables", () => {
  const config = JSON.parse(fs.readFileSync(productionConfigPath, "utf8"));
  assert.equal(
    config.firestore && config.firestore.rules,
    undefined,
    "firebase.json ne doit JAMAIS redeclarer de cle firestore.rules : ce repo ne doit " +
      "plus pouvoir publier de regles Firestore en production (voir note en tete de " +
      "firestore.rules)",
  );
});

test("l'emulateur Firestore applique reellement les regles, pas un mode permissif par defaut", async () => {
  const projectId = process.env.GCLOUD_PROJECT || "demo-rules-guard";
  const { initializeApp } = require("firebase/app");
  const { getFirestore, connectFirestoreEmulator, doc, setDoc } = require("firebase/firestore");

  const [emulatorHost, emulatorPort] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const app = initializeApp({ projectId }, "rules-guard-client");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, emulatorHost, Number(emulatorPort));

  // `prospects` est "allow read, write: if false" sans aucune condition dans
  // firestore.rules -- refuse a TOUT le monde, y compris un client non
  // authentifie, des lors que les regles sont effectivement chargees. Si
  // l'emulateur tournait en mode permissif par defaut (regles absentes/mal
  // referencees), cette ecriture reussirait au lieu d'etre rejetee, et ce
  // test le detecterait.
  await assert.rejects(
    () => setDoc(doc(db, "prospects", "rules_guard_probe"), { probe: true }),
    (error) => {
      assert.equal(
        error.code,
        "permission-denied",
        "une ecriture non authentifiee sur prospects/{doc} doit etre refusee par les " +
          "regles Firestore -- si elle reussit, l'emulateur tourne en mode permissif " +
          "par defaut (regles non chargees)",
      );
      return true;
    },
  );
});
