const { randomUUID, createHash } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { crawlWebsite, validEmail } = require("./prospect_crawler");

const { DEFAULT_SETTINGS, parseSettings } = require("./prospect_settings");

const fail = (code, message) => { throw new HttpsError(code, message); };
const clean = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const now = () => new Date().toISOString();
function validateMessage(input) {
  const to = clean(input.to, 254).toLowerCase(); const subject = clean(input.subject, 200); const body = clean(input.body, 10000);
  if (!validEmail(to) || !subject || /[\r\n]/.test(subject) || !body) fail("invalid-argument", "Destinataire, objet et message valides requis.");
  return { to, subject, body };
}
// ProposalGenerator boundary: replace only with a provider accepting these factual inputs.
const factualProposalGenerator = {
  async generate({ name, city }, settings = DEFAULT_SETTINGS) {
    settings = parseSettings(settings);
    const traffic = settings.connections_per_day === null ? "" : `Nous sommes actuellement autour de ${settings.connections_per_day} connexions par jour sur l’application.\n\n`;
    const company = clean(name, 500).replace(/[\r\n]/g, " "); const location = clean(city, 500).replace(/[\r\n]/g, " ");
    const personal = company && location ? `Je vous contacte pour présenter ce concept à ${company}, à ${location}.\n\n` : "";
    return {
      subject: `Découvrir Proxiplay${company ? ` — ${company}` : ""}`.slice(0, 200),
      body: `Bonjour,\n\nJe me permets de vous contacter pour vous présenter Proxiplay, une application locale qui permet aux entreprises du Dunkerquois de se faire connaître de manière ludique auprès d’une communauté locale.\n\n${personal}Le principe est simple : votre entreprise propose un jeu et un lot, et les utilisateurs découvrent votre activité en venant tenter leur chance.\n\n${traffic}Vous pouvez découvrir Proxiplay ici :\n${settings.download_url}\n\nSi le concept peut vous intéresser, je peux vous l’expliquer rapidement.\n\n${settings.sender_name}\n${settings.signature}\n${settings.website_url}`,
    };
  },
};

// EmailSender adapter reuses the existing OVH transport, secrets and From configuration.
function createOvhEmailSender(getMailerTransport) {
  return {
    async send(message) {
      const { transport, from, replyTo } = getMailerTransport({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000, requireTLS: true });
      const info = await transport.sendMail({ from, replyTo, to: message.to, subject: message.subject, text: message.body,
        messageId: `<prospect-${message.id}@proxiplay.fr>` });
      if (!info.accepted?.some((address) => String(address).toLowerCase() === message.to)) fail("internal", "Envoi refusé.");
      return { provider_message_id: info.messageId || null };
    },
  };
}

function createProspectEmailService({ db, assertAdmin, sender, crawler = crawlWebsite, generator = factualProposalGenerator }) {
  const refFor = (id) => { if (typeof id !== "string" || !/^[\w-]{1,200}$/.test(id)) fail("invalid-argument", "Identifiant invalide."); return db.collection("prospects").doc(id); };
  const current = async (tx, ref) => {
    const data = (await tx.get(ref)).data();
    if (!data || data.deleting) fail("not-found", "Prospect introuvable.");
    return data;
  };
  const update = (tx, ref, data, fields) => tx.update(ref, { ...fields, revision: (data.revision || 0) + 1, updated_at: now() });
  async function enrich(id) {
    const ref = refFor(id); const token = randomUUID(); const slotsRef = db.doc("prospection_internal/email_crawl_slots");
    // Distributed semaphore, shared across all admins, requests and function instances.
    const website = await db.runTransaction(async (tx) => {
      const data = await current(tx, ref); const slots = (await tx.get(slotsRef)).data()?.slots || [];
      const active = slots.filter((slot) => slot.expires > Date.now());
      if (active.length >= 3 || active.some((slot) => slot.id === id)) fail("resource-exhausted", "Recherche occupée. Réessayez dans un instant.");
      tx.set(slotsRef, { slots: [...active, { id, token, expires: Date.now() + 90000 }] });
      update(tx, ref, data, { email_enrichment_status: "running", email_enrichment_token: token });
      return data.website;
    });
    let result;
    try { result = await crawler(website); }
    catch { result = { emails: [], status: "failed", error_code: "SITE_INACCESSIBLE" }; }
    return db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data(); const slots = (await tx.get(slotsRef)).data()?.slots || [];
      tx.set(slotsRef, { slots: slots.filter((slot) => slot.token !== token) });
      // A deletion/erasure that happened during the crawl invalidates its result.
      if (!data || data.deleting || data.email_enrichment_token !== token) return { id, status: "failed", count: 0, error_code: "RESULT_DISCARDED" };
      const previous = data.emails || []; const merged = new Map(previous.map((item) => [item.email, item]));
      for (const item of result.emails) if (!merged.has(item.email)) merged.set(item.email, item);
      const primary = previous.find((item) => item.is_primary)?.email || result.emails.find((item) => item.is_primary)?.email;
      const emails = [...merged.values()].slice(0, 100).map((item) => ({ ...item, is_primary: item.email === primary }));
      update(tx, ref, data, { emails, email_enrichment_status: emails.length ? "found" : result.status,
        email_enriched_at: now(), email_enrichment_error: result.error_code || null, email_enrichment_token: null });
      // Manual email/contact_email fields are never written by enrichment.
      return { id, status: emails.length ? "found" : result.status, count: emails.length };
    });
  }
  async function handle(request) {
    assertAdmin(request); const actor = request.auth.uid; const input = request.data || {};
    const settingsRef = db.doc("prospection_internal/commercial_settings");
    const testRef = db.doc(`prospection_internal/email_tests/attempts/${createHash("sha256").update(actor).digest("hex")}`);
    if (input.action === "settings_get") {
      const saved = (await settingsRef.get()).data();
      return { settings: parseSettings(saved?.values || {}), revision: saved?.revision || 0, test: (await testRef.get()).data() || null };
    }
    if (input.action === "settings_save") {
      const values = parseSettings(input.settings);
      return db.runTransaction(async tx => {
        const saved = (await tx.get(settingsRef)).data();
        if (input.revision !== (saved?.revision || 0)) fail("failed-precondition", "Les paramètres ont changé. Rechargez-les.");
        const revision = (saved?.revision || 0) + 1;
        tx.set(settingsRef, { values, revision, updated_at: now(), actor });
        return { settings: values, revision };
      });
    }
    if (input.action === "test_prepare") {
      const to = clean(request.auth.token?.email, 254).toLowerCase();
      if (!validEmail(to)) fail("failed-precondition", "Adresse du compte admin requise.");
      return db.runTransaction(async tx => {
        const existing = (await tx.get(testRef)).data();
        if (existing) return { test: existing };
        const settings = parseSettings((await tx.get(settingsRef)).data()?.values || {});
        const draft = await generator.generate({}, settings);
        const message = { ...draft, subject: `[TEST Proxiplay] ${draft.subject}`, to, id: randomUUID(), status: "draft", actor, created_at: now() };
        tx.create(testRef, message); return { test: message };
      });
    }
    if (input.action === "test_send") {
      if (input.confirmed !== true) fail("invalid-argument", "Confirmation requise.");
      const reserved = await db.runTransaction(async tx => {
        const message = (await tx.get(testRef)).data();
        if (!message || message.id !== input.testId || message.to !== request.auth.token?.email?.toLowerCase()) fail("failed-precondition", "Préparez le test avec votre compte admin.");
        if (message.status !== "draft") return { duplicate: true, status: message.status };
        tx.update(testRef, { status: "sending" }); return { message };
      });
      if (reserved.duplicate) return reserved;
      let result;
      try { result = await sender.send({ ...validateMessage(reserved.message), id: reserved.message.id }); }
      catch { await testRef.update({ status: "failed", error_code: "SMTP_FAILED_OR_UNKNOWN" }); fail("internal", "Test échoué ou résultat incertain. Aucun renvoi automatique."); }
      await testRef.update({ status: "sent", sent_at: now(), provider_message_id: result.provider_message_id });
      return { status: "sent" };
    }
    if (input.action === "enrich_batch") {
      if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 3) fail("invalid-argument", "Sélectionnez de 1 à 3 prospects par étape.");
      const results = await Promise.all([...new Set(input.ids)].map(async (id) => {
        try { return await enrich(id); } catch (error) { return { id, status: "failed", count: 0, error_code: error.code === "resource-exhausted" ? "BUSY" : "SEARCH_FAILED" }; }
      }));
      return { results, found: results.filter((r) => r.status === "found").length, not_found: results.filter((r) => r.status === "not_found").length, failed: results.filter((r) => r.status === "failed").length, emails: results.reduce((sum, r) => sum + r.count, 0) };
    }
    const ref = refFor(input.id);
    if (input.action === "enrich") return enrich(input.id);
    if (input.action === "send") {
      if (input.confirmed !== true || !/^[\w-]{1,100}$/.test(input.draftId || "")) fail("invalid-argument", "Confirmation requise.");
      const logRef = ref.collection("emails").doc(input.draftId);
      const reservation = await db.runTransaction(async (tx) => {
        const data = await current(tx, ref); const logged = (await tx.get(logRef)).data();
        if (data.do_not_contact) fail("failed-precondition", "Ce prospect ne doit pas être contacté.");
        if (logged) return { duplicate: true, status: logged.status };
        if (data.email_sending_id) fail("failed-precondition", "Un envoi est déjà en cours ou à vérifier.");
        if (data.proposal?.id !== input.draftId || data.proposal?.revision !== input.revision) fail("failed-precondition", "La proposition a changé. Rechargez-la.");
        const message = validateMessage(data.proposal);
        tx.create(logRef, { ...message, status: "sending", created_at: now(), sent_at: null, provider_message_id: null, error_code: null, actor });
        update(tx, ref, data, { email_sending_id: input.draftId, proposal: { ...data.proposal, status: "sending" } });
        return { message: { ...message, id: input.draftId } };
      });
      if (reservation.duplicate) return reservation;
      let delivered;
      try { delivered = await sender.send(reservation.message); }
      catch {
        // SMTP disconnects can be ambiguous. Never automatically retry this key.
        await db.runTransaction(async (tx) => {
          const data = await current(tx, ref);
          tx.update(logRef, { status: "failed", error_code: "SMTP_FAILED_OR_UNKNOWN" });
          update(tx, ref, data, { email_sending_id: null, proposal: { ...data.proposal, status: "failed" } });
        });
        fail("internal", "Envoi échoué ou résultat incertain. Vérifiez la boîte d’envoi avant tout nouvel envoi volontaire.");
      }
      // Never mark provider success as SMTP failure if Firestore finalization fails.
      await db.runTransaction(async (tx) => {
        const data = await current(tx, ref); const at = now();
        tx.update(logRef, { status: "sent", sent_at: at, provider_message_id: delivered.provider_message_id });
        tx.create(ref.collection("history").doc(input.draftId), { action: "email_sent", actor, at,
          detail: `Email envoyé à ${reservation.message.to} — ${reservation.message.subject}`, to: reservation.message.to, subject: reservation.message.subject, status: "sent", provider_message_id: delivered.provider_message_id });
        update(tx, ref, data, { last_contact_at: at, status: ["new", "to_contact"].includes(data.status) ? "contacted" : data.status,
          email_sending_id: null, proposal: { ...data.proposal, status: "sent", sent_at: at } });
      });
      return { status: "sent" };
    }
    return db.runTransaction(async (tx) => {
      const data = await current(tx, ref);
      if (data.email_sending_id) fail("failed-precondition", "Un envoi est en cours ou à vérifier.");
      if (input.action === "erase") {
        update(tx, ref, data, { emails: [], email_enrichment_status: "not_started", email_enriched_at: null, email_enrichment_token: null, email_enrichment_error: null, proposal: null });
      } else if (input.action === "do_not_contact") {
        if (typeof input.value !== "boolean") fail("invalid-argument", "Valeur invalide.");
        update(tx, ref, data, { do_not_contact: input.value });
      } else if (input.action === "primary") {
        if (!(data.emails || []).some((item) => item.email === input.email)) fail("invalid-argument", "Email public introuvable.");
        update(tx, ref, data, { emails: data.emails.map((item) => ({ ...item, is_primary: item.email === input.email })) });
      } else if (input.action === "generate") {
        if (data.proposal && input.replace !== true) fail("failed-precondition", "Confirmez le remplacement du brouillon.");
        const settings = parseSettings((await tx.get(db.doc("prospection_internal/commercial_settings"))).data()?.values || {});
        const proposal = { ...await generator.generate({ name: data.name, city: data.city, category: data.category, website: data.website }, settings),
          to: data.contact_email || data.email || data.emails?.find((item) => item.is_primary)?.email || "", id: randomUUID(), revision: 1, status: "draft" };
        update(tx, ref, data, { proposal }); return { proposal };
      } else if (input.action === "save") {
        if (!data.proposal || data.proposal.status !== "draft" || data.proposal.id !== input.draftId || data.proposal.revision !== input.revision) fail("failed-precondition", "La proposition a changé. Rechargez-la.");
        const proposal = { ...data.proposal, ...validateMessage(input), revision: data.proposal.revision + 1 };
        update(tx, ref, data, { proposal }); return { proposal };
      } else fail("invalid-argument", "Action inconnue.");
      return { success: true };
    });
  }
  return { handle };
}
module.exports = { createProspectEmailService, createOvhEmailSender, factualProposalGenerator, validateMessage };
