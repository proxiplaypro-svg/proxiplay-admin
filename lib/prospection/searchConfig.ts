// Internal sectors are not Google place types. Keep queries explicit and bounded.
// Eight complementary trades: avoids beauty, hair, automotive and retail categories.
export const ARTISAN_QUERIES = ["plombier", "électricien", "peintre en bâtiment", "menuisier", "paysagiste", "couvreur", "chauffagiste", "serrurier"] as const;
export const SECTOR_QUERIES: Record<string, readonly string[]> = {
  "artisans B2C": ARTISAN_QUERIES,
  "bars/cafés": ["bar", "café"],
  "beauté": ["institut de beauté"],
  "coiffure": ["salon de coiffure"],
  "sport": ["salle de sport"],
  "automobile": ["garage automobile"],
  "habitat": ["magasin aménagement maison"],
  "services locaux": ["pressing", "cordonnier", "toilettage animaux"],
};
export function queriesForSector(sector: string): readonly string[] { return SECTOR_QUERIES[sector] || [sector]; }
export function isArtisanSearch(categories: string[]) { return categories.includes("artisans B2C"); }
export function businessCallBudget(limit: number, categories: string[]) {
  return isArtisanSearch(categories) ? (limit === 20 ? 6 : 8) : (limit === 20 ? 1 : 4);
}
