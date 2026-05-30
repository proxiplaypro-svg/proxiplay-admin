import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cachedAdminApp: App | null = null;

function readAdminServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) {
    console.error("[FIREBASE_ADMIN_INIT_MISSING_ENV]", {
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(privateKey),
    });
    throw new Error(
      "Firebase Admin env vars are incomplete. Expected FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
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
