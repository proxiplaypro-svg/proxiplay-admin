import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let cachedAdminApp: App | null = null;

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();
}

function readAdminServiceAccount() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim() || "";
  const hasServiceAccountJson = Boolean(serviceAccountJson);

  let projectId = "";
  let clientEmail = "";
  let privateKey = "";

  if (serviceAccountJson) {
    try {
      const parsedServiceAccount = JSON.parse(serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };

      projectId = parsedServiceAccount.project_id?.trim() || "";
      clientEmail = parsedServiceAccount.client_email?.trim() || "";
      privateKey = normalizePrivateKey(parsedServiceAccount.private_key || "");
    } catch (error) {
      console.error("[FIREBASE_ADMIN_INIT_INVALID_SERVICE_ACCOUNT_JSON]", {
        hasServiceAccountJson,
      });
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.", {
        cause: error,
      });
    }
  }

  if (!projectId || !clientEmail || !privateKey) {
    projectId = projectId || process.env.FIREBASE_PROJECT_ID?.trim() || "";
    clientEmail = clientEmail || process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
    privateKey =
      privateKey || normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || "");
  }

  const adminInitLog = {
    hasServiceAccountJson,
    projectId,
    hasClientEmail: Boolean(clientEmail),
    hasPrivateKey: Boolean(privateKey),
    privateKeyStartsWithBegin: privateKey.startsWith("-----BEGIN PRIVATE KEY-----"),
    privateKeyHasEnd: privateKey.includes("-----END PRIVATE KEY-----"),
  };

  console.info("[FIREBASE_ADMIN_INIT_CONFIG]", adminInitLog);

  if (!projectId || !clientEmail || !privateKey) {
    console.error("[FIREBASE_ADMIN_INIT_MISSING_ENV]", {
      ...adminInitLog,
    });
    throw new Error(
      "Firebase Admin env vars are incomplete. Expected FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
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
    credential: cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
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
