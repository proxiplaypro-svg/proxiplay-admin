// Statut de validation administrative d'un commerçant (users.account_status).
// Valeurs lues par les règles Firestore, les Cloud Functions et l'app :
// pendingValidation, approved, rejected, suspended. L'Admin web ne les écrit
// qu'à la création d'un compte (approved) ; il ne les modifie jamais lors d'une
// édition. La possibilité de se connecter est un état distinct, porté par
// Firebase Auth (disabled).
//
// "active" et "inactive" sont d'anciennes valeurs écrites par l'Admin web :
// elles sont conservées telles quelles et signalées « à régulariser ».

export const VALIDATION_STATUSES = ["pendingValidation", "approved", "rejected", "suspended"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export const LEGACY_ACCOUNT_STATUSES = ["active", "inactive"] as const;

const labels: Record<ValidationStatus, string> = {
  pendingValidation: "En attente de validation",
  approved: "Validé",
  rejected: "Refusé",
  suspended: "Suspendu",
};

export type MerchantValidation = {
  status: string;
  label: string;
  legacy: boolean;
};

export function merchantValidation(raw: unknown): MerchantValidation {
  const status = typeof raw === "string" ? raw.trim() : "";
  if ((VALIDATION_STATUSES as readonly string[]).includes(status)) {
    return { status, label: labels[status as ValidationStatus], legacy: false };
  }
  if ((LEGACY_ACCOUNT_STATUSES as readonly string[]).includes(status)) {
    return { status, label: `Statut à régulariser (ancien : ${status})`, legacy: true };
  }
  return { status, label: status ? `Statut inconnu (${status})` : "Non renseigné", legacy: false };
}

// Un commerce nouvellement associé à un compte n'est ouvert que si ce compte
// est validé et peut se connecter. "active" reste accepté pour les comptes
// créés par l'ancien Admin web.
export function isMerchantValidated(raw: unknown) {
  const status = typeof raw === "string" ? raw.trim() : "";
  return status === "approved" || status === "active";
}
