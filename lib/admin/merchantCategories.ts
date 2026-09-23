export type MerchantCategory = { value: string; label: string; active: boolean };

// Production has no category registry or per-category status: the stored label
// itself is the value. Never split on commas (several real labels contain one).
export function categoriesFromEnseignes(rows: { category?: unknown }[]): MerchantCategory[] {
  const values = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row.category)) continue;
    for (const value of row.category) if (typeof value === "string" && value.trim()) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, "fr")).map(value => ({ value, label: value, active: true }));
}

export function selectedCategoryValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
