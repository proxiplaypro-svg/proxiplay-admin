// Monthly challenge ("Défi du mois" / "Commerçant du mois") as edited in the
// web Admin. The callables (adminGet/UpsertMonthlyChallenge) remain the only
// writers; this module only converts between the form and their payload.

export type MonthlyChallengeType = "attendance" | "merchant";

export type MonthlyChallengeForm = {
  type: MonthlyChallengeType;
  month: string; // YYYY-MM
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  targetDays: string;
  title: string;
  description: string;
  prizeTitle: string;
  prizeDescription: string;
  prizeValue: string;
  imageUrl: string;
  partnerShopId: string; // "" = ProxiPlay challenge, no partner
  enabled: boolean;
};

export type MonthlyChallengeState = {
  exists: boolean;
  enabled: boolean;
  cancelled: boolean;
  startMs: number | null;
  drawMs: number | null;
  drawStatus: string;
};

export function challengeId(type: MonthlyChallengeType, month: string) {
  return type === "merchant" ? `merchant_${month}` : month;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function emptyForm(type: MonthlyChallengeType, month: string): MonthlyChallengeForm {
  const { start, end } = monthBounds(month);
  return {
    type, month, startDate: start, endDate: end, targetDays: "5", title: "", description: "",
    prizeTitle: "", prizeDescription: "", prizeValue: "", imageUrl: "", partnerShopId: "", enabled: false,
  };
}

// Callable responses carry Firestore timestamps as {_seconds} or {seconds}.
export function toMillis(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const seconds = typeof raw._seconds === "number" ? raw._seconds : typeof raw.seconds === "number" ? raw.seconds : null;
  return seconds == null ? null : seconds * 1000;
}

// A calendar day in Paris, read from a stored instant.
function parisDay(ms: number | null): string {
  if (ms == null) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function shopId(value: unknown): string {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const path = text(raw.path) || text((raw._path as Record<string, unknown> | undefined)?.segments ? (raw._path as { segments: string[] }).segments.join("/") : "");
    if (path.startsWith("enseignes/")) return path.slice("enseignes/".length);
  }
  const path = text(value);
  return path.startsWith("enseignes/") ? path.slice("enseignes/".length) : "";
}

export function formFromConfig(config: Record<string, unknown>, type: MonthlyChallengeType, month: string): MonthlyChallengeForm {
  const base = emptyForm(type, month);
  const startMs = toMillis(config.start_date);
  const endMs = toMillis(config.end_date);
  return {
    ...base,
    startDate: parisDay(startMs) || base.startDate,
    endDate: parisDay(endMs) || base.endDate,
    targetDays: config.target_days != null ? String(config.target_days) : base.targetDays,
    title: text(config.title),
    description: text(config.description),
    prizeTitle: text(config.prize_title),
    prizeDescription: text(config.prize_description),
    prizeValue: Number(config.prize_value) > 0 ? String(config.prize_value) : "",
    imageUrl: text(config.image_url),
    partnerShopId: shopId(config.enseigne_ref),
    enabled: config.enabled === true,
  };
}

export function stateFromConfig(config: Record<string, unknown>, drawStatus = ""): MonthlyChallengeState {
  return {
    exists: Boolean(config.updated_at || config.enabled === true || text(config.title)),
    enabled: config.enabled === true,
    cancelled: config.cancelled === true,
    startMs: toMillis(config.start_date),
    drawMs: toMillis(config.draw_date),
    drawStatus,
  };
}

export type ChallengeStatus = "draft" | "scheduled" | "running" | "awaiting_draw" | "drawn" | "cancelled";

export function challengeStatus(state: MonthlyChallengeState, nowMs = Date.now()): ChallengeStatus {
  if (["completed", "no_eligible_users"].includes(state.drawStatus)) return "drawn";
  if (state.cancelled) return "cancelled";
  if (!state.enabled) return "draft";
  if (state.startMs != null && nowMs < state.startMs) return "scheduled";
  if (state.drawMs != null && nowMs >= state.drawMs) return "awaiting_draw";
  return "running";
}

export const STATUS_LABEL: Record<ChallengeStatus, string> = {
  draft: "Désactivé",
  scheduled: "Programmé",
  running: "En cours",
  awaiting_draw: "Tirage en attente",
  drawn: "Tiré au sort",
  cancelled: "Annulé",
};

// Same rule as the server: once started and until drawn, the challenge can
// only be stopped by an explicit cancellation.
export function isLocked(state: MonthlyChallengeState, nowMs = Date.now()) {
  const status = challengeStatus(state, nowMs);
  return status === "running" || status === "awaiting_draw";
}

export function validateForm(form: MonthlyChallengeForm): string | null {
  if (!/^\d{4}-\d{2}$/.test(form.month)) return "Choisissez le mois du défi.";
  if (!form.startDate || !form.endDate || form.startDate > form.endDate) return "La période doit commencer avant sa fin.";
  if (!form.startDate.startsWith(form.month) || !form.endDate.startsWith(form.month)) return "La période doit rester dans le mois choisi.";
  const days = Number(form.targetDays);
  const periodDays = Math.round((Date.parse(`${form.endDate}T12:00:00Z`) - Date.parse(`${form.startDate}T12:00:00Z`)) / 86400000) + 1;
  if (!Number.isInteger(days) || days < 1) return "L'objectif doit être d'au moins 1 jour.";
  if (days > periodDays) return `L'objectif ne peut pas dépasser la durée de la période (${periodDays} jours).`;
  if (form.type === "merchant" && !form.partnerShopId) return "Le Commerçant du mois nécessite un commerçant partenaire.";
  if (form.enabled && (!form.title.trim() || !form.prizeTitle.trim())) return "Titre et lot sont obligatoires pour activer le défi.";
  if (form.prizeValue && !(Number(form.prizeValue) >= 0)) return "La valeur du lot doit être un nombre.";
  return null;
}

// Dates are sent at noon UTC so the server always reads the chosen Paris day.
export function payloadFromForm(form: MonthlyChallengeForm, partnerName = "") {
  return {
    challenge_id: challengeId(form.type, form.month),
    type: form.type,
    month: form.month,
    enabled: form.enabled,
    start_date: `${form.startDate}T12:00:00Z`,
    end_date: `${form.endDate}T12:00:00Z`,
    target_days: Number(form.targetDays),
    title: form.title.trim(),
    description: form.description.trim(),
    prize_title: form.prizeTitle.trim(),
    prize_description: form.prizeDescription.trim(),
    prize_value: form.prizeValue ? Number(form.prizeValue) : 0,
    image_url: form.imageUrl.trim(),
    enseigne_ref: form.partnerShopId ? `enseignes/${form.partnerShopId}` : null,
    enseigne_name: form.partnerShopId ? partnerName : "",
  };
}
