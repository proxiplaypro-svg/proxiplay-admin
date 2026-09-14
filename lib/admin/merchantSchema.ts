export class MerchantError extends Error {
  constructor(message: string, public status = 400, public code = "invalid-input") { super(message); }
}
export function textField(value: unknown, label: string, max = 300) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new MerchantError(`${label} invalide.`);
  return value.trim();
}
export function merchantEmail(value: unknown) {
  const email = textField(value, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MerchantError("Saisissez une adresse email valide.");
  return email;
}
export function commerceFields(body: Record<string, unknown>) {
  const fields: Record<string, string | string[] | boolean> = {};
  if (body.managed_by_admin !== undefined && typeof body.managed_by_admin !== "boolean") throw new MerchantError("Le mode de gestion doit être un booléen.");
  fields.managed_by_admin = body.managed_by_admin === true;
  for (const key of ["name", "description", "address", "area_code", "city", "phone", "site_web_url", "google_place_id", "imageUrl"]) fields[key] = textField(body[key], key, key === "description" ? 2000 : 500);
  if (!fields.name) throw new MerchantError("Le nom du commerce est obligatoire.");
  for (const key of ["site_web_url", "imageUrl"]) {
    if (fields[key] && !/^https?:\/\//i.test(fields[key] as string)) throw new MerchantError("Les liens doivent commencer par https:// ou http://.");
  }
  if (body.category != null && (!Array.isArray(body.category) || body.category.length > 30)) throw new MerchantError("Catégories invalides.");
  fields.category = [...new Set(((body.category ?? []) as unknown[]).map(value => textField(value, "Catégorie", 100)).filter(Boolean))];
  fields.phone_number = fields.phone;
  return fields;
}
// owner_id is the canonical reference; owner remains a legacy /users/{uid} string.
export function ownerUid(data: Record<string, unknown>) {
  const read = (value: unknown): string => {
    const path = typeof value === "string" ? value : value && typeof value === "object" && "path" in value ? String(value.path) : "";
    return path.match(/^\/?users\/([^/]+)$/)?.[1] ?? "";
  };
  const primary = read(data.owner_id);
  const legacy = read(data.owner);
  if (primary && legacy && primary !== legacy) throw new MerchantError("Les propriétaires de cette fiche sont incohérents. Corrigez l’association avant de gérer le compte.", 409);
  return primary || legacy;
}
