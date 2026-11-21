// Parcours de souscription V2.1 (phase 1, tranche 1) : libelles et fonctions
// pures de la console admin, sans dependance Firebase (testables seules).
// Le backend canonique (Functions us-central1) reste seul juge : la console
// n'ecrit jamais directement dans Firestore pour ces collections.

export const SITE_ORIGIN = "https://www.proxiplay.fr";

export type PromoKind = "percent" | "amount";

export type PromoCodePayload = {
  code: string;
  kind: PromoKind;
  value: number;
  offers: string[];
  validUntil: string | null;
  maxUses: number | null;
  repId: string | null;
  active: boolean;
};

export type PromoFormInput = {
  code: string;
  kind: string;
  value: string;
  offers: string[];
  validUntil: string;
  maxUses: string;
  repId: string;
  active: boolean;
};

/** URL complete d'un lien nominatif (le serveur ne renvoie que le chemin). */
export function repLinkUrl(path: string): string {
  if (!path.startsWith("/espace-commercant/?lien=")) throw new Error("Chemin de lien inattendu");
  return `${SITE_ORIGIN}${path}`;
}

/**
 * Formulaire de code promotionnel -> charge utile de adminUpsertPromoCode.
 * Montant saisi en euros HT, envoye en centimes. Aucun identifiant Stripe :
 * le code Stripe sera cree par le serveur en tranche 2 (sens unique).
 */
export function parsePromoForm(input: PromoFormInput): PromoCodePayload {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error("Code : 3 à 32 caractères (lettres, chiffres, - et _).");
  if (input.kind !== "percent" && input.kind !== "amount") throw new Error("Type de remise inconnu.");
  const raw = Number(input.value.replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) throw new Error("Remise invalide.");
  const value = input.kind === "percent" ? Math.round(raw) : Math.round(raw * 100);
  if (input.kind === "percent" && (value < 1 || value > 100)) throw new Error("Pourcentage entre 1 et 100.");
  if (input.kind === "amount" && value < 100) throw new Error("Montant d'au moins 1 € HT.");
  const maxUses = input.maxUses.trim() ? Number(input.maxUses) : null;
  if (maxUses !== null && !(Number.isInteger(maxUses) && maxUses >= 1)) throw new Error("Nombre d'utilisations invalide.");
  return {
    code,
    kind: input.kind,
    value,
    offers: input.offers.filter((offer) => offer === "autonome" || offer === "accompagnee"),
    validUntil: input.validUntil ? new Date(`${input.validUntil}T23:59:59`).toISOString() : null,
    maxUses,
    repId: input.repId.trim() || null,
    active: input.active,
  };
}

export function formatCents(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value / 100);
}

export function promoLabel(promo: { kind?: string; value?: number | null; value_cents?: number | null }): string {
  if (promo.kind === "percent") return `${promo.value ?? "?"} % sur la première année`;
  return `${formatCents(promo.value_cents ?? null)} HT sur la première année`;
}

// ---- lot 1.2-min : verification manuelle (checklist G, art. 4.1)

export const CHECKS = [
  { id: "siret", label: "SIRET", hint: "Format valide, entreprise identifiée et active (Annuaire des entreprises)" },
  { id: "identity", label: "Identité", hint: "Nom commercial, raison sociale et coordonnées renseignés" },
  { id: "activity", label: "Activité", hint: "Compatible avec les règles de ProxiPlay" },
  { id: "duplicate", label: "Doublon d'enseigne", hint: "Pas de second abonnement pour la même enseigne (nom et adresse)" },
  { id: "offer", label: "Offre et tarif", hint: "Catalogue et promotions autorisées" },
  { id: "origin", label: "Origine", hint: "Spontanée ou démarchée, déterminée par le serveur" },
  { id: "cgv", label: "CGV", hint: "Version et acceptation enregistrées" },
  { id: "fraud", label: "Fraude", hint: "Anomalies manifestes signalées" },
] as const;

export type CheckId = (typeof CHECKS)[number]["id"];
export type CheckResult = "pass" | "fail" | "manual";
export type CheckRecord = { result: CheckResult; note?: string | null };

export const CHECK_RESULT_LABELS: Record<CheckResult, string> = {
  pass: "Conforme",
  fail: "Non conforme",
  manual: "À revoir",
};

// Motifs de refus de l'art. 4.1, communiques au commercant.
export const REFUSAL_MOTIFS = {
  activity: "Activité incompatible avec les règles de ProxiPlay",
  inaccurate: "Informations manifestement inexactes",
  fraud: "Risque de fraude",
  unavailable: "Indisponibilité de l'offre",
} as const;

export type RefusalMotif = keyof typeof REFUSAL_MOTIFS;

export const CONTRACT_STATE_LABELS: Record<string, string> = {
  submitted: "À vérifier",
  confirmed: "Confirmée",
  refused: "Refusée",
  // Tranche 2a
  withdrawal_pending: "Délai de rétractation",
  payment_invited: "En attente de paiement",
  active: "Actif",
  withdrawn: "Rétractée",
  closed_unpaid: "Close sans paiement",
  ended: "Terminé",
};

/** Etats ou l'admin peut envoyer ou renvoyer l'invitation a payer (lot 1.6). */
export function canSendPaymentInvitation(state: string | undefined, withdrawalDeadlineMs: number | null, nowMs = Date.now()): boolean {
  if (state === "payment_invited") return true;
  return state === "withdrawal_pending" && withdrawalDeadlineMs !== null && nowMs > withdrawalDeadlineMs;
}

/** Controles manquants ou non conformes : la confirmation exige 8 « Conforme ». */
export function blockingChecks(checks: Partial<Record<string, CheckRecord>> | undefined): string[] {
  return CHECKS.filter((check) => checks?.[check.id]?.result !== "pass").map((check) => check.label);
}

/** Saisie du formulaire -> controles envoyes (seulement ceux renseignes). */
export function checksFromForm(entries: Record<string, { result: string; note: string }>): Partial<Record<CheckId, CheckRecord>> {
  const out: Partial<Record<CheckId, CheckRecord>> = {};
  for (const check of CHECKS) {
    const entry = entries[check.id];
    if (!entry || !entry.result) continue;
    if (!["pass", "fail", "manual"].includes(entry.result)) throw new Error(`Résultat invalide pour ${check.label}.`);
    out[check.id] = { result: entry.result as CheckResult, note: entry.note.trim() || null };
  }
  return out;
}

// ---- configuration du parcours (app_config/merchant_contracts), ecrite par
// l'outil serveur adminUpdateMerchantContractsConfig (validation + journal).

export type ContractsConfigPayload = {
  cgv?: { version: string; sha256: string; storagePath: string; url: string; effectiveDate: string };
  adminAlertEmail?: string | null;
};

/** Formulaire CGV + adresse des alertes -> charge utile (l'interrupteur a son propre bouton). */
export function parseConfigForm(input: {
  version: string; sha256: string; storagePath: string; url: string; effectiveDate: string; adminAlertEmail: string;
}): ContractsConfigPayload {
  const payload: ContractsConfigPayload = {};
  const cgvFields = [input.version, input.sha256, input.storagePath, input.url, input.effectiveDate].map((v) => v.trim());
  if (cgvFields.some(Boolean)) {
    if (cgvFields.some((v) => !v)) throw new Error("CGV : tous les champs sont requis (version, empreinte, chemin, adresse, date).");
    const [version, sha256, storagePath, url, effectiveDate] = cgvFields;
    if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error("Empreinte SHA-256 : 64 caractères hexadécimaux.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Date d'entrée en vigueur : AAAA-MM-JJ.");
    if (!url.startsWith("https://")) throw new Error("Adresse publique des CGV : https requis.");
    payload.cgv = { version, sha256: sha256.toLowerCase(), storagePath, url, effectiveDate };
  }
  const email = input.adminAlertEmail.trim();
  payload.adminAlertEmail = email || null;
  return payload;
}

// ---- tranche 2a, lot 1.5 : retractation (art. 7)
export const WITHDRAWABLE_STATES = ["withdrawal_pending", "payment_invited", "active"];

/** Saisie admin possible pour une souscription demarchee dans un etat retractable. */
export function canRecordWithdrawal(state: string | undefined, origin: string | undefined): boolean {
  return origin === "demarchee" && WITHDRAWABLE_STATES.includes(state || "");
}
