import { getFunctions } from "firebase/functions";
import { firebaseApp } from "./client-app";

export const functionsClient = getFunctions(firebaseApp, "europe-west1");

// Backend canonique (depot Proxiplay-main-mars2026 / app mobile), meme
// projet Firebase, autre region. Le paiement commercant Stripe (checkout,
// webhook, parrainage 100 EUR) y est implemente -- jamais duplique dans
// les Functions propres a ce depot admin.
export const canonicalFunctionsClient = getFunctions(firebaseApp, "us-central1");
