import { getAdminDb } from "@/lib/firebase/admin-app";
import { categoriesFromEnseignes } from "./merchantCategories";

export async function loadMerchantCategories() {
  const snapshot = await getAdminDb().collection("enseignes").select("category").get();
  return categoriesFromEnseignes(snapshot.docs.map(doc => doc.data()));
}
