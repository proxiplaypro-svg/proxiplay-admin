<<<<<<< HEAD
import { readFileSync } from "node:fs";
=======
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cachedAdminApp: App | null = null;

<<<<<<< HEAD
type AdminServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n").replace(/^"|"$/g, "").trim();
}

function readDevelopmentServiceAccount(): AdminServiceAccount | null {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!credentialsPath) {
    return null;
=======
function readAdminServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars are incomplete. Expected FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
  }

  const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  return {
    projectId: serviceAccount.project_id?.trim() || "proxi-play-odzp2e",
    clientEmail: serviceAccount.client_email?.trim() || "",
    privateKey: normalizePrivateKey(serviceAccount.private_key || ""),
  };
}

<<<<<<< HEAD
function readProductionServiceAccount(): AdminServiceAccount {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || "proxi-play-odzp2e",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim() || "",
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || ""),
  };
}

function readAdminServiceAccount() {
  const serviceAccount =
    process.env.NODE_ENV === "production"
      ? readProductionServiceAccount()
      : readDevelopmentServiceAccount() || readProductionServiceAccount();

  console.info("[FIREBASE_ADMIN_INIT_CONFIG]", {
    hasProjectId: Boolean(serviceAccount.projectId),
    hasClientEmail: Boolean(serviceAccount.clientEmail),
    hasPrivateKey: Boolean(serviceAccount.privateKey),
    privateKeyStartsWithBegin: serviceAccount.privateKey.startsWith("-----BEGIN PRIVATE KEY-----"),
    privateKeyHasEnd: serviceAccount.privateKey.includes("-----END PRIVATE KEY-----"),
  });

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error("Firebase Admin credentials are incomplete.");
  }

  return serviceAccount;
}

=======
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
export function getAdminApp(): App {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    cachedAdminApp = existingApp;
    return existingApp;
  }

<<<<<<< HEAD
  console.info("[FIREBASE_ADMIN_INIT_START]");

  const serviceAccount = readAdminServiceAccount();

=======
  const serviceAccount = readAdminServiceAccount();

>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
  cachedAdminApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

<<<<<<< HEAD
  console.info("[FIREBASE_ADMIN_INIT_SUCCESS]", {
    projectId: serviceAccount.projectId,
  });

=======
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
  return cachedAdminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
