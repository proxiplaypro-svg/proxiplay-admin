// Creation UNIQUE de la campagne bus_dunkerque en production, avec la meme
// fonction que l'Admin (createQrCampaign : validations, transaction, fiche
// de chemin, journal). Statut force a « a preparer » par la fonction.
// Identifiants : identifiants par defaut (ADC) du compte proprietaire.
// Usage : npx tsx scripts/create-qr-campaign-prod.ts --confirm
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createQrCampaign } from "@/lib/qr/qrCampaignAdmin";

const PROJECT_ID = "proxi-play-odzp2e";

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("--confirm requis.");
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Emulateur actif : refus.");
  const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, "qr-prod-create"));
  const campaign = await createQrCampaign(db, {
    id: "bus_dunkerque",
    name: "Bus Dunkerque",
    slug: "bus",
    destinationUrl: "https://onelink.to/jx4ee7",
    channel: "bus",
    launchAt: null,
  }, "proxiplay.pro@gmail.com (création initiale)");
  console.log(JSON.stringify({ id: campaign.id, name: campaign.name, publicUrl: campaign.publicUrl,
    destinationUrl: campaign.destinationUrl, status: campaign.status, channel: campaign.channel }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("ERREUR", error?.status ?? "", error?.message ?? error);
  process.exit(1);
});
