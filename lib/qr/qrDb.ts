// Base Firestore des campagnes QR.
//
// Production : la base de l'Admin (getAdminDb).
// Vercel Preview : JAMAIS la base de production, quelles que soient les
// variables heritees du projet (FIREBASE_* sont partagees Production et
// Preview). Une Preview doit fournir une base de test dediee via
// QR_FIREBASE_PROJECT_ID, QR_FIREBASE_CLIENT_EMAIL, QR_FIREBASE_PRIVATE_KEY ;
// sinon l'acces echoue : la redirection part vers le lien de secours et
// rien n'est compte.

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";

export const PRODUCTION_FIREBASE_PROJECT_ID = "proxi-play-odzp2e";
const QR_APP_NAME = "qr-campaigns-isolated";

export class QrDatabaseUnavailableError extends Error {}

type Env = Record<string, string | undefined>;

/** Ou lire et ecrire, sans rien initialiser (testable). */
export function resolveQrDatabaseTarget(env: Env = process.env):
  | { kind: "admin" }
  | { kind: "isolated"; projectId: string; clientEmail: string; privateKey: string } {
  const isPreview = env.VERCEL_ENV === "preview";
  const projectId = env.QR_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (projectId) {
    if (projectId === PRODUCTION_FIREBASE_PROJECT_ID && isPreview) {
      throw new QrDatabaseUnavailableError("Preview : base de production interdite pour les campagnes QR.");
    }
    const clientEmail = env.QR_FIREBASE_CLIENT_EMAIL?.trim() ?? "";
    const privateKey = (env.QR_FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").replace(/^"|"$/g, "").trim();
    if (!clientEmail || !privateKey) throw new QrDatabaseUnavailableError("Base de test QR incomplète.");
    return { kind: "isolated", projectId, clientEmail, privateKey };
  }
  if (isPreview) {
    throw new QrDatabaseUnavailableError("Preview sans base de test QR : aucune lecture ni écriture.");
  }
  return { kind: "admin" };
}

export function getQrDb(): Firestore {
  const target = resolveQrDatabaseTarget();
  if (target.kind === "admin") return getAdminDb();
  const existing = getApps().find((app) => app.name === QR_APP_NAME);
  const app = existing ?? initializeApp({
    credential: cert({ projectId: target.projectId, clientEmail: target.clientEmail, privateKey: target.privateKey }),
    projectId: target.projectId,
  }, QR_APP_NAME);
  return getFirestore(existing ? getApp(QR_APP_NAME) : app);
}
