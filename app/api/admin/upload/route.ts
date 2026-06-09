import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
<<<<<<< HEAD
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "@/lib/firebase/admin-app";

export const runtime = "nodejs";
=======
import "@/lib/firebase/admin-app";
import { getStorage } from "../../../../functions/node_modules/firebase-admin/lib/storage";
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)

function buildStorageError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizePath(value: string) {
  const path = value.trim().replace(/^\/+/, "");

  if (!path || path.includes("..") || path.endsWith("/")) {
    return null;
  }

  return path;
}

function getPublicFileUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const rawPath = formData.get("path");

    if (!(file instanceof File)) {
      return buildStorageError("Le fichier est obligatoire.");
    }

    if (typeof rawPath !== "string") {
      return buildStorageError("Le chemin de destination est obligatoire.");
    }

    const storagePath = normalizePath(rawPath);
    if (!storagePath) {
      return buildStorageError("Le chemin de destination est invalide.");
    }

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucketName) {
      return buildStorageError("La configuration Firebase Storage est incomplete.", 500);
    }

<<<<<<< HEAD
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
=======
    const bucket = getStorage().bucket(bucketName);
>>>>>>> 5d9a10e (campaigns: fix schéma jeux animation + dates instant_winners)
    const bucketFile = bucket.file(storagePath);
    const downloadToken = randomUUID();
    const arrayBuffer = await file.arrayBuffer();

    await bucketFile.save(Buffer.from(arrayBuffer), {
      resumable: false,
      metadata: {
        contentType: file.type || "application/octet-stream",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    return NextResponse.json({
      url: getPublicFileUrl(bucket.name, storagePath, downloadToken),
      path: storagePath,
    });
  } catch (error) {
    console.error("Admin upload failed", error);
    return buildStorageError("Impossible d uploader le fichier pour le moment.", 500);
  }
}
