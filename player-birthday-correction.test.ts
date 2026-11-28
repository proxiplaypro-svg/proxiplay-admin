import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  birthdayCorrectionErrorMessage,
  birthdayCorrectionSummary,
  buildBirthdayCorrectionPayload,
  parisTodayKey,
} from "./lib/admin/playerBirthdayCorrection";

// 27/11/2026 00:30 a Paris = 26/11/2026 23:30 UTC : le jour de Paris fait foi.
const now = new Date("2026-11-26T23:30:00Z");

test("payload : parametres exacts de adminCorrectPlayerBirthday (userId, birthday, reason)", () => {
  assert.deepEqual(
    buildBirthdayCorrectionPayload({ userId: " u1 ", birthday: "1990-05-17", reason: "  Erreur   de saisie " }, now),
    { ok: true, payload: { userId: "u1", birthday: "1990-05-17", reason: "Erreur de saisie" } },
  );
});

test("motif obligatoire (5 a 200 caracteres)", () => {
  for (const reason of ["", "   ", "abcd", "x".repeat(201)]) {
    assert.equal(buildBirthdayCorrectionPayload({ userId: "u1", birthday: "1990-05-17", reason }, now).ok, false, reason);
  }
  assert.equal(buildBirthdayCorrectionPayload({ userId: "u1", birthday: "1990-05-17", reason: "x".repeat(200) }, now).ok, true);
});

test("date : reelle, entre 1900 et aujourd'hui a Paris", () => {
  const ok = (birthday: string) => buildBirthdayCorrectionPayload({ userId: "u1", birthday, reason: "Erreur de saisie" }, now).ok;
  assert.equal(parisTodayKey(now), "2026-11-27");
  assert.equal(ok("2026-11-27"), true); // aujourd'hui a Paris, deja demain en UTC
  assert.equal(ok("2026-11-28"), false);
  assert.equal(ok("1900-01-01"), true);
  assert.equal(ok("1899-12-31"), false);
  assert.equal(ok("2023-02-29"), false);
  assert.equal(ok("2024-02-29"), true);
  assert.equal(ok("17/05/1990"), false);
  assert.equal(ok(""), false);
});

test("joueur invalide refuse", () => {
  for (const userId of ["", " ", "a/b", "x".repeat(129)]) {
    assert.equal(buildBirthdayCorrectionPayload({ userId, birthday: "1990-05-17", reason: "Erreur de saisie" }, now).ok, false);
  }
});

test("compte rendu : tranches d'age, jamais la date", () => {
  assert.equal(
    birthdayCorrectionSummary({ changed: true, previousAgeBand: "18_plus", newAgeBand: "under_15", marketingConsentWithdrawn: true }),
    "Date de naissance corrigée (18 ans et plus → moins de 15 ans). Moins de 15 ans : le consentement marketing a été retiré.",
  );
  assert.equal(
    birthdayCorrectionSummary({ changed: false, previousAgeBand: "18_plus", newAgeBand: "18_plus", marketingConsentWithdrawn: false }),
    "Date identique à celle enregistrée : aucune modification.",
  );
});

test("erreurs : message serveur repris quand il existe", () => {
  assert.equal(birthdayCorrectionErrorMessage({ code: "functions/failed-precondition",
    message: "Seule la date de naissance d'un joueur peut etre corrigee." }),
  "Seule la date de naissance d'un joueur peut etre corrigee.");
  assert.equal(birthdayCorrectionErrorMessage({ code: "functions/permission-denied", message: "x" }),
    "Correction réservée à l'administration.");
  assert.equal(birthdayCorrectionErrorMessage({ code: "functions/not-found", message: "" }), "Joueur introuvable.");
  assert.equal(birthdayCorrectionErrorMessage({ code: "functions/internal", message: "internal" }),
    "Impossible de corriger la date de naissance. Réessayez dans un instant.");
  assert.equal(birthdayCorrectionErrorMessage(new Error("network")),
    "Impossible de corriger la date de naissance. Réessayez dans un instant.");
});

test("page joueur : correction par la fonction serveur, jamais d'ecriture directe de birthday", () => {
  const page = readFileSync("app/admin/joueurs/[userId]/page.tsx", "utf8");
  assert.match(page, /<PlayerBirthdayCorrectionPanel userId=\{player\.id\} \/>/);
  assert.doesNotMatch(page, /birthday/);
  const panel = readFileSync("components/admin/PlayerBirthdayCorrectionPanel.tsx", "utf8");
  assert.match(panel, /buildBirthdayCorrectionPayload\(/);
  assert.match(panel, /correctPlayerBirthdayAction\(/);
  assert.doesNotMatch(panel, /updateDoc|setDoc|firebase\/firestore/);
  const actions = readFileSync("lib/firebase/adminActions.ts", "utf8");
  assert.match(actions, /httpsCallable<BirthdayCorrectionPayload, BirthdayCorrectionResult>\(\s*canonicalFunctionsClient,\s*"adminCorrectPlayerBirthday"/);
});
