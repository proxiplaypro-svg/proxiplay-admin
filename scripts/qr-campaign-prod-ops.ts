// Operations de mise en service de bus_dunkerque en production, avec les
// memes fonctions que l'Admin. Identifiants : ADC du compte proprietaire.
//   npx tsx scripts/qr-campaign-prod-ops.ts stats <AAAA-MM-JJ> <AAAA-MM-JJ>
//   npx tsx scripts/qr-campaign-prod-ops.ts activate --confirm
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getQrCampaign, getQrCampaignStats, listQrCampaignChanges, updateQrCampaign } from "@/lib/qr/qrCampaignAdmin";

const PROJECT_ID = "proxi-play-odzp2e";
const CAMPAIGN = "bus_dunkerque";

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Emulateur actif : refus.");
  const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, "qr-prod-ops"));
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "stats") {
    const campaign = await getQrCampaign(db, CAMPAIGN);
    const stats = await getQrCampaignStats(db, CAMPAIGN, a, b);
    console.log(JSON.stringify({ status: campaign.status, destination: campaign.destinationUrl, publicUrl: campaign.publicUrl,
      totals: stats.totals, devices: stats.devices, daily: stats.daily, hoursWithOpens: stats.hourly.map((n, h) => n ? `${h}h:${n}` : "").filter(Boolean) }));
    const slug = (await db.collection("qr_campaign_slugs").doc("bus").get()).data();
    console.log(JSON.stringify({ slugDoc: { campaign_id: slug?.campaign_id, status: slug?.status, destination_url: slug?.destination_url } }));
    console.log(JSON.stringify({ changes: (await listQrCampaignChanges(db, CAMPAIGN)).map((c) => ({ at: c.at, by: c.by, kind: c.kind, changes: c.changes })) }));
    return;
  }
  if (mode === "activate") {
    if (!process.argv.includes("--confirm")) throw new Error("--confirm requis.");
    const campaign = await updateQrCampaign(db, CAMPAIGN, { status: "active" }, "proxiplay.pro@gmail.com (activation)");
    console.log(JSON.stringify({ id: campaign.id, status: campaign.status, publicUrl: campaign.publicUrl, destinationUrl: campaign.destinationUrl }));
    return;
  }
  throw new Error("Mode inconnu.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("ERREUR", error?.status ?? "", error?.message ?? error);
  process.exit(1);
});
