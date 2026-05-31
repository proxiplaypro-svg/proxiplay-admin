import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const rawFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
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
    };

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);


