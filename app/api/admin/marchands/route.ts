import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin-app";

type CreateMerchantBody = {
  email?: string;
  name?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildTemporaryPassword() {
  return `Px-${randomBytes(18).toString("base64url")}!9a`;
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);

    switch (code) {
      case "auth/email-already-exists":
        return "Cette adresse email est deja utilisee.";
      case "auth/invalid-email":
        return "L adresse email saisie n est pas valide.";
      default:
        return "Impossible de creer le compte marchand pour le moment.";
    }
  }

  return "Impossible de creer le compte marchand pour le moment.";
}

export async function POST(request: Request) {
  let createdUid: string | null = null;

  try {
    const body = (await request.json()) as CreateMerchantBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";

    if (!name) {
      return NextResponse.json({ error: "Le nom du commerce est obligatoire." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "L email du commercant est obligatoire." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "L adresse email saisie n est pas valide." }, { status: 400 });
    }

    const userRecord = await adminAuth.createUser({
      email,
      displayName: name,
      password: buildTemporaryPassword(),
    });
    createdUid = userRecord.uid;

    await adminDb.collection("enseignes").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      name,
      created_at: FieldValue.serverTimestamp(),
      status: "active",
      commercial_status: "actif",
      owner: `/users/${userRecord.uid}`,
      owner_id: adminDb.doc(`users/${userRecord.uid}`),
    });

    return NextResponse.json({
      uid: userRecord.uid,
      email,
      name,
    });
  } catch (error) {
    if (createdUid) {
      try {
        await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.error("Merchant auth cleanup failed", cleanupError);
      }
    }

    console.error("Merchant creation failed", error);

    const message = getErrorMessage(error);
    const status = message === "Cette adresse email est deja utilisee." ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
