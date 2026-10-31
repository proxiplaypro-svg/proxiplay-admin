// Demandes du formulaire commerçant du site public (submitPartnerLead).
// Chaque demande valide est écrite dans Firestore AVANT l'envoi de l'e-mail :
// une panne SMTP ne fait plus perdre de demande.

const PARTNER_LEADS_COLLECTION = "partner_leads";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5000;
// Prospects B2B : conservation 3 ans (référentiel CNIL), appliquée par une règle TTL Firestore sur expireAt.
const RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

// [longueur maximale, obligatoire]. La ville est obligatoire sur la page mais reste
// facultative ici pour accepter les envois de l'ancienne page pendant le déploiement.
const LEAD_FIELDS = {
  business: [120, true],
  name: [120, true],
  email: [254, true],
  phone: [40, false],
  city: [120, false],
  activity: [120, false],
};

function leadValue(value, limit, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > limit || /[\r\n]/.test(text)) return null;
  return text;
}

function readLead(body) {
  const lead = {};
  for (const [field, [limit, required]] of Object.entries(LEAD_FIELDS)) {
    const value = leadValue(body[field], limit, required);
    if (value === null) return null;
    lead[field] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return null;
  return lead;
}

function leadEmail(lead, leadId) {
  const optional = (value) => value || "Non renseigné";
  return {
    replyTo: lead.email,
    subject: `[Partenariat] ${lead.business}${lead.city ? ` – ${lead.city}` : ""}`,
    text: [
      `Enseigne : ${lead.business}`,
      `Contact : ${lead.name}`,
      `Email : ${lead.email}`,
      `Téléphone : ${optional(lead.phone)}`,
      `Ville : ${optional(lead.city)}`,
      `Activité : ${optional(lead.activity)}`,
      leadId ? `Référence : ${PARTNER_LEADS_COLLECTION}/${leadId}` : "Référence : non enregistrée (échec Firestore)",
    ].join("\n"),
  };
}

async function verifyTurnstileToken({ secret, token, remoteIp, fetchImpl = fetch }) {
  const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: remoteIp || "" }),
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Turnstile siteverify HTTP ${response.status}`);
  const verification = await response.json();
  return verification.success === true;
}

// Renvoie { status, body } ; aucune exception ne remonte au gestionnaire HTTP.
async function handlePartnerLead({ body, deps }) {
  const { verifyTurnstile, saveLead, updateLead, sendMail, describeMailError, logger, now = () => new Date() } = deps;
  if (body.website) return { status: 200, body: { ok: true } };

  const lead = readLead(body);
  if (!lead) return { status: 400, body: { error: "invalid_fields" } };

  const token = leadValue(body.turnstileToken, 4096, true);
  if (!token) return { status: 400, body: { error: "missing_turnstile_token" } };

  let verified;
  try {
    verified = await verifyTurnstile(token);
  } catch (error) {
    logger.error("Partner lead Turnstile verification unavailable", { safeMessage: String(error && error.message).slice(0, 200) });
    return { status: 503, body: { error: "verification_unavailable" } };
  }
  if (!verified) return { status: 400, body: { error: "verification_failed" } };

  const createdAt = now();
  let leadId = null;
  try {
    leadId = await saveLead({
      ...lead,
      source: "site_solution_commercants",
      status: "received",
      createdAt,
      expireAt: new Date(createdAt.getTime() + RETENTION_MS),
    });
  } catch (error) {
    logger.error("Partner lead storage failed", { safeMessage: String(error && error.message).slice(0, 200) });
  }

  try {
    await sendMail(leadEmail(lead, leadId));
    if (leadId) await updateLead(leadId, { status: "emailed", emailedAt: now() }).catch(() => {});
    return { status: 200, body: { ok: true } };
  } catch (error) {
    const safeMessage = describeMailError(error);
    logger.error("Partner lead delivery failed", { safeMessage, leadId });
    if (!leadId) return { status: 502, body: { error: "delivery_failed" } };
    await updateLead(leadId, { status: "email_failed", emailError: safeMessage }).catch(() => {});
    // La demande est conservée : le visiteur n'a pas à la renvoyer.
    return { status: 200, body: { ok: true, delivery: "pending" } };
  }
}

module.exports = {
  LEAD_FIELDS,
  PARTNER_LEADS_COLLECTION,
  RETENTION_MS,
  handlePartnerLead,
  leadEmail,
  readLead,
  verifyTurnstileToken,
};
