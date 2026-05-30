import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function readServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (rawJson) {
    const parsed = JSON.parse(rawJson) as ServiceAccount;
    return {
      projectId: parsed.projectId,
      clientEmail: parsed.clientEmail,
      privateKey: parsed.privateKey?.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function createAdminApp(): App {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  const serviceAccount = readServiceAccountFromEnv();

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const adminApp = createAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
