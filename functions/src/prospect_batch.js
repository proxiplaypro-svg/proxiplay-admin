const { randomUUID, createHash } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { parseSettings } = require("./prospect_settings");
const { prospectRecipient } = require("./prospect_recipient");
const INTERVAL_MS = 30000;
const LEASE_MS = 150000; // Longer than the callable's 120-second lifetime.
const fail = (code, message) => { throw new HttpsError(code, message); };
const validId = id => typeof id === "string" && /^[\w-]{1,100}$/.test(id);
// Optional text confirmed by the admin for this batch. Absent: drafts come from the saved template.
function parseBatchMessage(input) {
  if (input.subject === undefined && input.body === undefined) return null;
  const subject = typeof input.subject === "string" ? input.subject.trim() : ""; const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject) || !body || body.length > 10000) fail("invalid-argument", "Objet (200 caractères, une ligne) et message (10 000 caractères) requis.");
  return { subject, body };
}
function parseVariants(input) {
  if (!input.variants) return null;
  if (typeof input.variants !== "object") fail("invalid-argument", "Variantes invalides.");
  const a = parseBatchMessage(input.variants.a || {}); const b = parseBatchMessage(input.variants.b || {});
  if (!a || !b) fail("invalid-argument", "Les variantes A et B doivent avoir un objet et un message.");
  return { a, b };
}
function followUpDue(p, at = Date.now()) {
  if (p.do_not_contact || !["contacted", "follow_up"].includes(p.status)) return false;
  const scheduled = p.next_follow_up_at ? Date.parse(p.next_follow_up_at) : Number.NaN;
  if (Number.isFinite(scheduled)) return scheduled <= at;
  if (p.status === "follow_up") return true;
  const last = p.last_contact_at ? Date.parse(p.last_contact_at) : Number.NaN;
  return Number.isFinite(last) && at - last >= 7 * 24 * 60 * 60 * 1000;
}

// Browser requests bounded steps; the server owns recipients, progress, locks and cadence.
// Closing the browser pauses the batch. Resuming never replaces a draft or replays an uncertain send.
function createBatchService({ db, generator, sender, sendEmail, clock = Date.now }) {
  const batchRef = id => { if (!validId(id)) fail("invalid-argument", "Lot invalide."); return db.doc(`prospection_email_batches/${id}`); };
  const gateRef = db.doc("prospection_internal/bulk_smtp_gate");
  const owner = (data, actor) => { if (!data || data.actor !== actor) fail("permission-denied", "Lot inaccessible."); return data; };
  async function view(ref, actor) {
    const batch = owner((await ref.get()).data(), actor);
    const items = await Promise.all(batch.items.map(async item => {
      if (!item.draftId) return item;
      const p = (await db.doc(`prospects/${item.id}`).get()).data();
      return { ...item, prospect_status: p?.status || null, body: p?.proposal?.id === item.draftId && p.proposal.revision === item.revision ? p.proposal.body : "Proposition modifiée ou supprimée. Préparez un nouveau lot." };
    }));
    return { batch: { ...batch, id: ref.id, items } };
  }
  async function handle(input, actor) {
    const currentRef = db.doc(`prospection_internal/bulk_current/actors/${createHash("sha256").update(actor).digest("hex")}`);
    if (input.action === "batch_current") {
      const id = (await currentRef.get()).data()?.id;
      return id ? view(batchRef(id), actor) : { batch: null };
    }
    if (input.action === "batch_template") {
      const settings = parseSettings((await db.doc("prospection_internal/commercial_settings").get()).data()?.values || {});
      const { subject, body } = await generator.generate({}, settings, { kind: input.kind === "follow_up" ? "follow_up" : "initial" });
      return { subject, body };
    }
    const ref = batchRef(input.batchId);
    if (input.action === "batch_prepare") {
      if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 50 || input.ids.some(id => typeof id !== "string" || !/^[\w-]{1,200}$/.test(id))) fail("invalid-argument", "Sélectionnez de 1 à 50 prospects maximum.");
      const ids = [...new Set(input.ids)];
      const message = parseBatchMessage(input);
      const variants = parseVariants(input);
      const kind = input.kind === "follow_up" ? "follow_up" : "initial";
      const campaignName = typeof input.campaignName === "string" ? input.campaignName.trim().slice(0, 120) : "";
      const identity = sender.identity(); // Public headers only; never return SMTP credentials.
      await db.runTransaction(async tx => {
        const existing = (await tx.get(ref)).data();
        if (existing) { owner(existing, actor); return; }
        const pointer = (await tx.get(currentRef)).data();
        const previous = pointer ? (await tx.get(batchRef(pointer.id))).data() : null;
        if (previous?.confirmed && previous.items.some(i => ["ready", "processing"].includes(i.state))) fail("failed-precondition", "Terminez le lot courant avant de préparer un autre lot.");
        const settings = parseSettings((await tx.get(db.doc("prospection_internal/commercial_settings"))).data()?.values || {});
        const snapshots = await Promise.all(ids.map(id => tx.get(db.doc(`prospects/${id}`))));
        const logs = await Promise.all(snapshots.map(s => s.data()?.proposal?.id ? tx.get(s.ref.collection("emails").doc(s.data().proposal.id)) : null));
        const items = [];
        for (let index = 0; index < snapshots.length; index++) {
          const snapshot = snapshots[index]; const p = snapshot.data(); const id = ids[index];
          const to = prospectRecipient(p);
          let reason = !p || p.deleting ? "Prospect supprimé" : p.do_not_contact ? "Opposition au contact" : !to ? "Sans adresse email envoyable" : kind === "follow_up" && !followUpDue(p, clock()) ? "Relance non échue, réponse ou statut terminal" : p.email_sending_id ? "Envoi en cours ou à vérifier" : kind !== "follow_up" && (logs[index]?.exists || (p.proposal && p.proposal.status !== "draft")) ? "Proposition déjà envoyée ou déjà tentée" : "";
          if (!reason && p.proposal && p.proposal.to.toLowerCase() !== to) reason = "Le destinataire du brouillon diffère de l’adresse email retenue";
          if (reason) { items.push({ id, name: p?.name || id, to, state: "excluded", reason }); continue; }
          let proposal = p.proposal; let changed = false;
          if (!proposal || (kind === "follow_up" && proposal.status !== "draft")) {
            proposal = { ...await generator.generate({ name: p.name, city: p.city, category: p.category, subcategory: p.subcategory, website: p.website }, settings, { kind }), to, id: randomUUID(), revision: 1, status: "draft" };
            changed = true;
          }
          // Only unsent drafts reach this point: sent or attempted proposals were excluded above.
          const variant = variants ? (index % 2 === 0 ? "A" : "B") : null;
          const confirmedMessage = variant ? variants[variant.toLowerCase()] : message;
          if (confirmedMessage && (proposal.subject !== confirmedMessage.subject || proposal.body !== confirmedMessage.body)) {
            proposal = { ...proposal, ...confirmedMessage, revision: changed ? proposal.revision : proposal.revision + 1 };
            changed = true;
          }
          if (changed) tx.update(snapshot.ref, { proposal, revision: (p.revision || 0) + 1, updated_at: new Date(clock()).toISOString() });
          items.push({ id, name: p.name || id, to, subject: proposal.subject, draftId: proposal.id, revision: proposal.revision, state: "ready", ...(variant ? { variant } : {}) });
        }
        tx.create(ref, { actor, items, confirmed: false, identity, kind, ...(campaignName ? { campaign_name: campaignName } : {}), created_at: new Date(clock()).toISOString() });
        tx.set(currentRef, { id: ref.id });
      });
      return view(ref, actor);
    }
    if (input.action === "batch_get") return view(ref, actor);
    if (input.action === "batch_confirm") {
      if (input.confirmed !== true) fail("invalid-argument", "Confirmation explicite requise.");
      await db.runTransaction(async tx => {
        const b = owner((await tx.get(ref)).data(), actor);
        const identity = sender.identity();
        if (JSON.stringify(identity) !== JSON.stringify(b.identity)) fail("failed-precondition", "Expéditeur modifié. Préparez un nouveau lot.");
        tx.update(ref, { confirmed: true });
      });
      return view(ref, actor);
    }
    if (input.action === "batch_retry") {
      if (input.confirmed !== true) fail("invalid-argument", "Confirmation explicite requise.");
      await db.runTransaction(async tx => {
        const b = owner((await tx.get(ref)).data(), actor);
        const item = b.items.find(i => i.id === input.id);
        if (!b.confirmed || !item?.retryable || item.state !== "failed" || b.items.some(i => ["ready", "processing"].includes(i.state))) fail("failed-precondition", "Terminez le lot avant de réessayer cet email.");
        tx.update(ref, { items: b.items.map(i => i.id === input.id ? { ...i, state: "ready", retry: true, retryable: false } : i) });
      });
      return view(ref, actor);
    }
    if (input.action !== "batch_step") fail("invalid-argument", "Action inconnue.");
    const token = randomUUID();
    const reservation = await db.runTransaction(async tx => {
      const b = owner((await tx.get(ref)).data(), actor);
      if (!b.confirmed) fail("failed-precondition", "Confirmez le lot avant tout envoi.");
      if (b.items.length > 50) fail("failed-precondition", "Lot trop volumineux.");
      const gate = (await tx.get(gateRef)).data();
      const wait = Math.max((gate?.expires || 0), (gate?.next_at || 0)) - clock();
      if (wait > 0) return { wait };
      const stale = b.items.find(i => i.state === "processing");
      if (stale) {
        const log = (await tx.get(db.doc(`prospects/${stale.id}/emails/${stale.draftId}`))).data();
        // A crashed invocation may have reached SMTP. Never reclaim its send key.
        tx.update(ref, { items: b.items.map(i => i.id === stale.id ? { ...i, state: log?.status === "sent" ? "sent" : "unknown", reason: "Résultat à vérifier dans le journal et la boîte d’envoi. Aucun renvoi automatique." } : i) });
        return {};
      }
      const item = b.items.find(i => i.state === "ready");
      if (!item) return {};
      tx.set(gateRef, { token, expires: clock() + LEASE_MS, next_at: clock() + INTERVAL_MS });
      tx.update(ref, { items: b.items.map(i => i.id === item.id ? { ...i, state: "processing" } : i) });
      return { item };
    });
    if (reservation.item) {
      const item = reservation.item; let result;
      try {
        const identity = sender.identity(); const b = owner((await ref.get()).data(), actor);
        if (JSON.stringify(identity) !== JSON.stringify(b.identity)) fail("failed-precondition", "Expéditeur modifié. Préparez un nouveau lot.");
        result = await sendEmail({ id: item.id, draftId: item.draftId, revision: item.revision, confirmed: true }, actor, { id: ref.id, retry: item.retry === true });
      } catch { /* Reconcile using the durable send log; never expose provider errors. */ }
      const log = (await db.doc(`prospects/${item.id}/emails/${item.draftId}`).get()).data();
      const state = log?.status === "sent" || result?.status === "sent" ? "sent" : log?.status === "sending" ? "unknown" : "failed";
      const retryable = log?.status === "failed" && log.error_code === "SMTP_REJECTED";
      const reason = state === "sent" ? "" : retryable ? "SMTP a refusé cet email. Vous pouvez réessayer uniquement cet email." : log ? "Résultat incertain : vérifiez le journal et la boîte d’envoi. Aucun renvoi automatique." : "Envoi bloqué : vérifiez l’opposition, l’email primaire et la version du brouillon, puis préparez un nouveau lot.";
      await db.runTransaction(async tx => {
        const b = owner((await tx.get(ref)).data(), actor); const gate = (await tx.get(gateRef)).data();
        tx.update(ref, { items: b.items.map(i => i.id === item.id ? { ...i, state, reason, retryable } : i) });
        if (gate?.token === token) tx.set(gateRef, { token: null, expires: 0, next_at: clock() + INTERVAL_MS });
      });
    }
    return { ...await view(ref, actor), waitMs: reservation.wait || INTERVAL_MS };
  }
  return { handle };
}
module.exports = { createBatchService, INTERVAL_MS, LEASE_MS };
