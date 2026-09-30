import { normalize, ProspectError } from "./model";

// Server-side translation of every UI sector. No internal label is sent implicitly.
export const ARTISAN_QUERIES = ["plombier", "électricien", "peintre en bâtiment", "menuisier", "paysagiste", "couvreur", "chauffagiste", "serrurier"] as const;
type Strategy = { mode: "simple" | "multi"; queries: readonly string[] };
// Furniture, decoration and appliances belong to Habitat; sports shops to Sport.
// Commerces deliberately excludes the queries owned by those specialized sectors.
export const SECTOR_SEARCH: Record<string, Strategy> = {
  restaurants: { mode: "simple", queries: ["restaurant"] },
  "bars/cafés": { mode: "multi", queries: ["bar", "café"] },
  commerces: { mode: "multi", queries: ["boutique de vêtements", "fleuriste", "bijouterie", "opticien", "magasin de chaussures", "librairie", "épicerie", "caviste", "boutique de cadeaux", "magasin de jouets", "papeterie", "chocolaterie", "pâtisserie", "boulangerie", "animalerie", "magasin de téléphonie", "magasin informatique", "mercerie"] },
  beauté: { mode: "simple", queries: ["institut de beauté"] },
  coiffure: { mode: "simple", queries: ["salon de coiffure"] },
  sport: { mode: "multi", queries: ["salle de sport", "studio de yoga", "studio de pilates", "salle d'escalade", "magasin de sport"] },
  loisirs: { mode: "multi", queries: ["bowling", "escape game", "parc de loisirs", "cinéma"] },
  automobile: { mode: "multi", queries: ["garage automobile", "concessionnaire automobile", "lavage automobile", "centre de contrôle technique"] },
  habitat: { mode: "multi", queries: ["magasin de meubles", "magasin de décoration", "cuisiniste", "magasin de literie", "magasin de bricolage", "magasin électroménager"] },
  "services locaux": { mode: "multi", queries: ["pressing", "cordonnier", "toilettage animaux", "photographe", "agence de voyages", "imprimerie"] },
  "artisans B2C": { mode: "multi", queries: ARTISAN_QUERIES },
};
function strategy(sector: string): Strategy {
  const key = Object.keys(SECTOR_SEARCH).find(key => normalize(key) === normalize(sector));
  if (normalize(sector) === "bars") return SECTOR_SEARCH["bars/cafés"];
  if (!key) throw new ProspectError("Secteur de prospection inconnu.");
  return SECTOR_SEARCH[key];
}
export function queriesForSector(sector: string): readonly string[] { return strategy(sector).queries; }
export function isMultiSearch(categories: string[]) { return categories.length > 1 || categories.some(sector => strategy(sector).mode === "multi"); }
const SEARCH_POLICY = {
  simple: { 20: { calls: 1, pageSize: 20 }, 50: { calls: 4, pageSize: 20 } },
  multi: { 20: { calls: 6, pageSize: 5 }, 50: { calls: 8, pageSize: 10 } },
} as const;
export function searchPolicy(limit: number, categories: string[]) {
  if (limit !== 20 && limit !== 50) throw new ProspectError("Limite de 20 ou 50 requise.");
  return SEARCH_POLICY[isMultiSearch(categories) ? "multi" : "simple"][limit];
}
export function businessCallBudget(limit: number, categories: string[]) {
  return searchPolicy(limit, categories).calls;
}
