import test from "node:test";
import assert from "node:assert/strict";
import { categoriesFromEnseignes, selectedCategoryValues } from "./lib/admin/merchantCategories";
import { commerceFields } from "./lib/admin/merchantSchema";

test("Firestore labels remain exact array elements, including commas; sorted and deduplicated", () => {
  const rows = [{ category: ["Loisirs, sport & culture", "Beauté & bien-être"] }, { category: ["Beauté & bien-être", "Maison, jardin & bricolage"] }, {}, { category: null }, { category: [null, 2, ""] }];
  assert.deepEqual(categoriesFromEnseignes(rows), ["Beauté & bien-être", "Loisirs, sport & culture", "Maison, jardin & bricolage"].map(value => ({ value, label: value, active: true })));
  assert.deepEqual(categoriesFromEnseignes([]), []);
});

test("stored categories preselect and round-trip without splitting or dropping historical values", () => {
  const category = ["Loisirs, sport & culture", "Ancien libellé"];
  assert.deepEqual(selectedCategoryValues(category), category);
  assert.deepEqual(commerceFields({ name: "Test", category }).category, category);
  assert.deepEqual(selectedCategoryValues(undefined), []);
});
