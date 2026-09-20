import { type ProspectFields, type Qualification, ProspectError, record } from "./model";

export interface QualificationProvider { name: string; qualify(facts: Pick<ProspectFields, "name" | "category" | "city" | "website">): Promise<unknown> }
// Every future AI adapter must pass this strict boundary before data is persisted.
export function parseQualification(value: unknown): Qualification {
  let decoded = value;
  if (typeof value === "string") { try { decoded = JSON.parse(value); } catch { throw new ProspectError("Réponse de qualification JSON invalide.", 502); } }
  const data = record(decoded);
  const keys = ["summary", "relevance", "reasons", "suggested_angle", "suggested_message"];
  if (Object.keys(data).length !== keys.length || keys.some(key => !Object.hasOwn(data, key))) throw new ProspectError("Structure de qualification invalide.", 502);
  for (const key of ["summary", "suggested_angle", "suggested_message"]) if (data[key] !== null && (typeof data[key] !== "string" || (data[key] as string).length > 10000)) throw new ProspectError("Texte de qualification invalide.", 502);
  if (data.relevance !== null && (typeof data.relevance !== "number" || !Number.isFinite(data.relevance) || data.relevance < 0 || data.relevance > 100)) throw new ProspectError("Score invalide.", 502);
  if (!Array.isArray(data.reasons) || data.reasons.length > 20 || data.reasons.some(reason => typeof reason !== "string" || !reason.trim() || reason.length > 1000)) throw new ProspectError("Justifications invalides.", 502);
  if (data.relevance !== null && !data.reasons.length) throw new ProspectError("Un score doit être expliqué.", 502);
  return data as Qualification;
}
export const factualDraftProvider: QualificationProvider = {
  name: "factual-draft-v1",
  async qualify(facts) {
    return {
      summary: [facts.name, facts.category, facts.city].filter(Boolean).join(" · "), relevance: null,
      reasons: [facts.category ? `Activité renseignée : ${facts.category}. Adéquation B2C et potentiel de lot à confirmer.` : "Activité à renseigner.", facts.city ? `Localisation renseignée : ${facts.city}. Zone commerciale à valider.` : "Localisation à renseigner.", facts.website ? "Un site est renseigné ; contenu non analysé." : "Présence numérique inconnue."],
      suggested_angle: "Vérifier l’intérêt pour de la visibilité locale via un jeu et la possibilité de proposer un lot.",
      suggested_message: `Bonjour, je vous contacte pour ${facts.name}${facts.city ? ` à ${facts.city}` : ""}${facts.category ? `, dont l’activité renseignée est « ${facts.category} »` : ""}. Proxiplay propose aux entreprises de gagner en visibilité locale grâce à des jeux. Seriez-vous disponible pour discuter de l’intérêt d’une opération avec un lot pour votre établissement ?`,
    };
  },
};
export async function qualifyProspect(facts: ProspectFields, provider: QualificationProvider = factualDraftProvider) {
  // Exclude personal contacts, notes and unrelated account data from provider input.
  return parseQualification(await provider.qualify({ name: facts.name, category: facts.category, city: facts.city, website: facts.website }));
}
