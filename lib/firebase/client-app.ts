import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const rawFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
};

const missingKeys = Object.entries(rawFirebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0 && typeof window !== "undefined") {
  throw new Error(
    `Firebase configuration is incomplete. Missing: ${missingKeys.join(", ")}. Check proxiplay-admin/.env.local and restart the Next.js dev server.`,
  );
}

const firebaseConfig = missingKeys.length === 0
  ? rawFirebaseConfig
  : {
      apiKey: rawFirebaseConfig.apiKey || "build-placeholder-api-key",
      authDomain: rawFirebaseConfig.authDomain || "build-placeholder-auth-domain",
      projectId: rawFirebaseConfig.projectId || "build-placeholder-project-id",
      storageBucket: rawFirebaseConfig.storageBucket || "build-placeholder-storage-bucket",
      messagingSenderId: rawFirebaseConfig.messagingSenderId || "build-placeholder-messaging-sender-id",
      appId: rawFirebaseConfig.appId || "build-placeholder-app-id",
    };

export const firebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export { firebaseConfig };
