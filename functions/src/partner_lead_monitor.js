const { onSchedule } = require("firebase-functions/v2/scheduler");
const { PARTNER_LEAD_FAILURE_LOG, PARTNER_LEADS_COLLECTION } = require("./partner_lead");

const WINDOW_MS = 24 * 60 * 60 * 1000;

// Statuts des demandes des dernières 24 h -> demandes encore en email_failed.
// Seuls les identifiants de documents sont journalisés, jamais les champs du formulaire.
function summarizeFailedLeads(leads) {
  const failed = leads.filter((lead) => lead.status === "email_failed");
  return { total: leads.length, failedCount: failed.length, failedLeadIds: failed.map((lead) => lead.id) };
}

async function reportFailedPartnerLeads({ db, logger, now = () => new Date() }) {
  const since = new Date(now().getTime() - WINDOW_MS);
  // Filtre sur createdAt seul (index automatique) ; le statut est compté en mémoire.
  const snapshot = await db.collection(PARTNER_LEADS_COLLECTION).where("createdAt", ">=", since).select("status").get();
  const summary = summarizeFailedLeads(snapshot.docs.map((doc) => ({ id: doc.id, status: doc.get("status") })));
  if (summary.failedCount > 0) {
    logger.error(PARTNER_LEAD_FAILURE_LOG, { reason: "email_failed_daily", count: summary.failedCount, leadIds: summary.failedLeadIds, since: since.toISOString() });
  } else {
    logger.info("Partner lead daily check", { total: summary.total, failedCount: 0, since: since.toISOString() });
  }
  return summary;
}

function createPartnerLeadFailureMonitor({ db, logger }) {
  return onSchedule(
    {
      schedule: "0 8 * * *",
      timeZone: "Europe/Paris",
      region: "europe-west1",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => { await reportFailedPartnerLeads({ db, logger }); },
  );
}

module.exports = { createPartnerLeadFailureMonitor, reportFailedPartnerLeads, summarizeFailedLeads };
