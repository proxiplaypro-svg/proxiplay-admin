import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cachedAdminApp: App | null = null;

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

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error("Firebase Admin credentials are incomplete.");
  }

  return serviceAccount;
}

export function getAdminApp(): App {
  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    cachedAdminApp = existingApp;
    return existingApp;
  }

  console.info("[FIREBASE_ADMIN_INIT_START]");

  const serviceAccount = readAdminServiceAccount();

  cachedAdminApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

  console.info("[FIREBASE_ADMIN_INIT_SUCCESS]", {
    projectId: serviceAccount.projectId,
  });

  return cachedAdminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
