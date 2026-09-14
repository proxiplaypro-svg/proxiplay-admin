// Couverture de test manquante pour firestore.rules : ce fichier n'existait
// pas avant ce commit. Il exerce directement les regles de securite
// (emulateur, @firebase/rules-unit-testing) plutot que la couche API/Admin
// SDK deja testee par merchant-admin.test.ts, qui contourne les regles.
//
// Verifie notamment, avec un VRAI token admin obtenu par un vrai sign-in
// emulateur (email seul, sans custom claim "admin" — jamais pose en
// pratique, confirme par grep : zero setCustomUserClaims dans ce repo),
// que l'admin reel garde la main sur une enseigne managed_by_admin=true.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  terminate,
} from "firebase/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Emulateurs Firestore + Auth requis.");
}

const PROJECT_ID = "demo-admin-merchants-rules";
const ADMIN_EMAIL = "proxiplay.pro@gmail.com";
let testEnv: RulesTestEnvironment;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_HOST!.split(":")[1] ?? 8080),
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const db = context.firestore();

    await db.doc("enseignes/shop-normal").set({ name: "Boutique normale", email: "owner@shop.fr" });
    await db.doc("enseignes/shop-managed").set({ name: "Boutique geree", email: "managed@shop.fr", managed_by_admin: true });
    await db.doc("merchants/merch-normal").set({ name: "Merchant normal", email: "m@shop.fr" });

    await db.doc("games/game-normal").set({ title: "Jeu normal", merchantId: "shop-normal", merchant_id: "shop-normal" });
    await db.doc("games/game-managed").set({ title: "Jeu geree", merchantId: "shop-managed", merchant_id: "shop-managed" });
    await db.doc("games/game-managed-ref").set({ title: "Jeu geree (ref)", enseigne_id: db.doc("enseignes/shop-managed") });

    await db.doc("prizes/prize-1").set({ game_id: db.doc("games/game-normal"), status: "remis" });
  });
});

function ownerCtx(email: string) {
  return testEnv.authenticatedContext("owner-uid", { email });
}

function randomCtx() {
  return testEnv.authenticatedContext("random-uid", { email: "random@nobody.fr" });
}

// --- Enseigne normale : comportement attendu inchange par managed_by_admin ---

test("proprietaire d'une enseigne normale peut modifier un champ autorise", async () => {
  const db = ownerCtx("owner@shop.fr").firestore();
  await assertSucceeds(updateDoc(doc(db, "enseignes/shop-normal"), { description: "maj" }));
});

test("meme le proprietaire ne peut pas changer owner/owner_id/email/status/managed_by_admin (verrouillage par champ)", async () => {
  const db = ownerCtx("owner@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "enseignes/shop-normal"), { email: "hijack@evil.fr" }));
  await assertFails(updateDoc(doc(db, "enseignes/shop-normal"), { managed_by_admin: true }));
  await assertFails(updateDoc(doc(db, "enseignes/shop-normal"), { status: "suspended" }));
});

test("creation et suppression d'une enseigne reservees a l'admin, meme pour son propre email", async () => {
  const db = ownerCtx("owner@shop.fr").firestore();
  await assertFails(setDoc(doc(db, "enseignes/shop-new"), { name: "Nouvelle", email: "owner@shop.fr" }));
  await assertFails(deleteDoc(doc(db, "enseignes/shop-normal")));
});

test("un utilisateur quelconque ne peut pas modifier l'enseigne d'un autre", async () => {
  const db = randomCtx().firestore();
  await assertFails(updateDoc(doc(db, "enseignes/shop-normal"), { description: "hijack" }));
});

// --- Enseigne managed_by_admin=true : hors de portee du commercant ---

test("le commercant d'une enseigne managed_by_admin=true ne peut plus rien modifier sur la fiche", async () => {
  const db = ownerCtx("managed@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "enseignes/shop-managed"), { description: "je gere quand meme" }));
});

test("le commercant ne peut pas repasser managed_by_admin a false", async () => {
  const db = ownerCtx("managed@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "enseignes/shop-managed"), { managed_by_admin: false }));
});

test("le commercant ne peut ni creer, ni modifier, ni supprimer un jeu (reference merchantId string) de son enseigne geree", async () => {
  const db = ownerCtx("managed@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "games/game-managed"), { title: "detourne" }));
  await assertFails(setDoc(doc(db, "games/game-managed-new"), { title: "nouveau", merchantId: "shop-managed", merchant_id: "shop-managed" }));
  await assertFails(deleteDoc(doc(db, "games/game-managed")));
});

test("idem via une reference enseigne_id (DocumentReference) plutot qu'un merchantId string", async () => {
  const db = ownerCtx("managed@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "games/game-managed-ref"), { title: "detourne" }));
});

// --- Compatibilite : enseigne historique sans champ managed_by_admin ---

test("enseigne historique (managed_by_admin absent) : comportement normal, proprietaire garde la main", async () => {
  const db = ownerCtx("owner@shop.fr").firestore();
  await assertSucceeds(updateDoc(doc(db, "games/game-normal"), { title: "Jeu normal modifie" }));
});

// --- Verrouillage de champ sur les jeux, meme pour le proprietaire legitime ---

test("le proprietaire d'un jeu normal ne peut pas reattribuer enseigne_id/merchantId/owner_id vers un autre commerce", async () => {
  const db = ownerCtx("owner@shop.fr").firestore();
  await assertFails(updateDoc(doc(db, "games/game-normal"), { merchantId: "shop-managed", merchant_id: "shop-managed" }));
});

// --- Gap connu, non corrige ici (hors perimetre de cette PR test-only) :
// la collection merchants n'a jamais recu le meme traitement managed_by_admin
// que enseignes sur ce commit de main. Ce test documente l'etat reel plutot
// que de pretendre qu'il est protege.
test("[gap connu] merchants/{id} n'est PAS protege par managed_by_admin sur ce commit de main — n'importe quel utilisateur signe peut ecrire", async () => {
  const db = randomCtx().firestore();
  await assertSucceeds(updateDoc(doc(db, "merchants/merch-normal"), { description: "toujours ouvert" }));
});

// --- L'admin REEL (pas un claim synthetique) garde la main sur tout ---

test("l'admin REEL (Google/email sign-in, AUCUN custom claim 'admin') peut gerer une enseigne managed_by_admin=true de bout en bout", async () => {
  const clientApp = initializeApp({ apiKey: "fake-api-key-for-emulator", projectId: PROJECT_ID, authDomain: "localhost" });
  const auth = getAuth(clientApp);
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST!.split(":");
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });

  const db = getFirestore(clientApp);
  const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
  connectFirestoreEmulator(db, fsHost, Number(fsPort));

  const credential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, "real-admin-password-123");
  const idTokenResult = await credential.user.getIdTokenResult();

  assert.equal(
    idTokenResult.claims.admin,
    undefined,
    "Le claim custom 'admin' ne doit pas exister sur un vrai token : confirme qu'aucun mecanisme ne le pose en pratique.",
  );

  await assertSucceeds(updateDoc(doc(db, "enseignes/shop-managed"), { description: "maj admin reel" }));
  await assertSucceeds(updateDoc(doc(db, "enseignes/shop-managed"), { managed_by_admin: false }));
  await assertSucceeds(setDoc(doc(db, "enseignes/shop-created-by-admin"), { name: "Creee par admin", email: "x@shop.fr" }));
  await assertSucceeds(setDoc(doc(db, "games/game-by-real-admin"), { title: "Jeu admin", merchantId: "shop-managed", merchant_id: "shop-managed" }));
  await assertSucceeds(updateDoc(doc(db, "games/game-managed-ref"), { title: "modifie par admin" }));
  await assertSucceeds(deleteDoc(doc(db, "games/game-by-real-admin")));

  await terminate(db);
  await deleteApp(clientApp);
});

// --- Lectures inchangees ---

test("lectures enseignes/games/prizes toujours accessibles, geree ou non", async () => {
  const db = randomCtx().firestore();
  await assertSucceeds(getDoc(doc(db, "enseignes/shop-normal")));
  await assertSucceeds(getDoc(doc(db, "enseignes/shop-managed")));
  await assertSucceeds(getDoc(doc(db, "games/game-managed")));
  await assertSucceeds(getDocs(collection(db, "prizes")));

  const dbAnon = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(dbAnon, "prizes")));
});
