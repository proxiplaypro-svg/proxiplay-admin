import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin-app";
import { isAllowedAdminEmail } from "@/lib/firebase/adminAccess";
import { commerceFields, merchantEmail, MerchantError, ownerUid, textField } from "./merchantSchema";

export async function existingMerchantAccount(email: string) {
  let account;
  try { account = await getAdminAuth().getUserByEmail(email); }
  catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return null;
    throw error;
  }
  const user = await getAdminDb().doc(`users/${account.uid}`).get();
  const eligible = user.data()?.user_role === "commercant" && !isAllowedAdminEmail(account.email) && !account.customClaims?.admin;
  return { account, user, eligible };
}

export async function createMerchant(body: Record<string, unknown>) {
  const fields = commerceFields(body);
  const mode = body.mode ?? "new";
  if (!["new", "existing", "shop"].includes(String(mode))) throw new MerchantError("Mode de création invalide.");
  if (body.active != null && typeof body.active !== "boolean") throw new MerchantError("Option d’activation invalide.");
  const active = body.active !== false;
  const db = getAdminDb();
  const auth = getAdminAuth();
  if (mode === "shop") {
    const shop = db.collection("enseignes").doc();
    await shop.create({ ...fields, status: "inactive", commercial_status: "inactif", created_at: FieldValue.serverTimestamp() });
    return { merchantId: shop.id, email: null };
  }
  const email = merchantEmail(body.email);
  if (isAllowedAdminEmail(email)) throw new MerchantError("Cette adresse est réservée à l’administration.", 409);
  const first_name = textField(body.first_name, "Prénom", 100);
  const last_name = textField(body.last_name, "Nom", 100);
  const phone_number = textField(body.account_phone, "Téléphone", 50);
  const existing = await existingMerchantAccount(email);
  if (existing && mode !== "existing") throw new MerchantError(existing.eligible
    ? "Cette adresse appartient déjà à un commerçant. Vous pouvez associer son compte existant sans modifier son profil."
    : "Cette adresse est déjà utilisée par un compte qui ne peut pas être associé. Choisissez une autre adresse.", 409, existing.eligible ? "existing-merchant" : "email-in-use");
  if (mode === "existing" && !existing?.eligible) throw new MerchantError("Aucun compte commerçant associable pour cette adresse.", 409);
  let createdUid: string | null = null;
  let committed = false;
  const shop = db.collection("enseignes").doc();
  try {
    const account = existing?.account ?? await auth.createUser({ email, displayName: [first_name, last_name].filter(Boolean).join(" ") || String(fields.name), password: `Px-${randomBytes(24).toString("base64url")}!9a`, disabled: !active });
    if (!existing) createdUid = account.uid;
    const userRef = db.doc(`users/${account.uid}`);
    await db.runTransaction(async tx => {
      const user = await tx.get(userRef);
      if (existing && user.data()?.user_role !== "commercant") throw new MerchantError("Le compte a changé. Rechargez la fiche.", 409);
      if (!existing && user.exists) throw new MerchantError("Un profil existe déjà pour ce compte.", 409);
      if (!existing) tx.create(userRef, { email, first_name, last_name, phone_number, user_role: "commercant", account_status: active ? "active" : "inactive", created_time: FieldValue.serverTimestamp() });
      const enabled = existing ? !account.disabled && user.data()?.account_status === "active" : active;
      tx.create(shop, { ...fields, email, owner: `/users/${account.uid}`, owner_id: userRef, status: enabled ? "active" : "inactive", commercial_status: enabled ? "actif" : "inactif", created_at: FieldValue.serverTimestamp() });
    });
    committed = true;
    return { merchantId: shop.id, email };
  } catch (error) {
    if (createdUid && !committed) {
      // A commit can succeed even when its acknowledgement is lost. Never delete
      // Auth until a read confirms that neither Firestore document was committed.
      try {
        const [savedShop, savedUser] = await db.getAll(shop, db.doc(`users/${createdUid}`));
        if (savedShop.exists && savedUser.exists && ownerUid(savedShop.data()!) === createdUid) return { merchantId: shop.id, email };
        if (savedShop.exists || savedUser.exists) throw new Error("Partial Firestore state");
      } catch {
        throw new MerchantError("Le résultat de la création n’a pas pu être confirmé. Vérifiez le compte avant de réessayer.", 500, "cleanup-required");
      }
      try { await auth.deleteUser(createdUid); }
      catch { console.error("Merchant Auth rollback failed", { uid: createdUid }); throw new MerchantError("Création interrompue. Un compte sans commerce doit être vérifié par l’administrateur technique avant de réessayer.", 500, "cleanup-required"); }
    }
    throw error;
  }
}

export async function readMerchantAccount(merchantId: string) {
  const shop = await getAdminDb().doc(`enseignes/${merchantId}`).get();
  if (!shop.exists) throw new MerchantError("Commerce introuvable.", 404);
  const uid = ownerUid(shop.data()!);
  if (!uid) return { account: null };
  const user = await getAdminDb().doc(`users/${uid}`).get();
  let account;
  try { account = await getAdminAuth().getUser(uid); }
  catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return { account: null, warning: "Le propriétaire enregistré n’a plus de compte. Associez un compte commerçant existant.", ownerUid: uid };
    throw error;
  }
  return { account: { uid, email: account.email ?? "", first_name: user.data()?.first_name ?? "", last_name: user.data()?.last_name ?? "", account_phone: user.data()?.phone_number ?? "", active: !account.disabled && user.data()?.account_status === "active", role: user.data()?.user_role ?? "" } };
}

export async function manageMerchantAccount(merchantId: string, body: Record<string, unknown>) {
  const db = getAdminDb();
  const auth = getAdminAuth();
  const shopRef = db.doc(`enseignes/${merchantId}`);
  const shop = await shopRef.get();
  if (!shop.exists) throw new MerchantError("Commerce introuvable.", 404);
  if (body.action === "profile") {
    if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) throw new MerchantError("Informations du commerce invalides.");
    const input = body.fields as Record<string, unknown>;
    const supported = ["name", "description", "address", "area_code", "city", "phone", "site_web_url", "google_place_id", "imageUrl", "category", "contact_name", "admin_note", "last_contact_channel", "commercial_status", "last_contact_at", "managed_by_admin"];
    if (Object.keys(input).some(key => !supported.includes(key))) throw new MerchantError("Champ non modifiable dans ce formulaire.");
    const normalized = commerceFields({ name: shop.data()?.name || "Commerce", ...input });
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (key in normalized) patch[key] = normalized[key];
      else if (key === "last_contact_at") {
        const date = textField(input[key], "Date du contact", 40);
        if (date && !Number.isFinite(Date.parse(date))) throw new MerchantError("Date de contact invalide.");
        patch[key] = date ? new Date(date) : FieldValue.delete();
      } else patch[key] = textField(input[key], key, key === "admin_note" ? 5000 : 300);
    }
    if ("commercial_status" in input && !["", "actif", "inactif", "a_relancer"].includes(String(input.commercial_status))) throw new MerchantError("Statut commercial invalide.");
    if ("phone" in input) patch.phone_number = normalized.phone;
    if ("imageUrl" in input && !input.imageUrl) { patch.imageUrl = FieldValue.delete(); patch.logo = FieldValue.delete(); }
    if (Object.keys(patch).length) await shopRef.update(patch);
    return { saved: true };
  }
  if (body.action === "associate") {
    const candidate = await existingMerchantAccount(merchantEmail(body.email));
    if (!candidate?.eligible) throw new MerchantError("Cette adresse ne correspond pas à un compte commerçant associable.", 409);
    await db.runTransaction(async tx => {
      const current = await tx.get(shopRef);
      const user = await tx.get(candidate.user.ref);
      if (ownerUid(current.data()!) !== (body.expectedOwner ?? "")) throw new MerchantError("Le propriétaire a changé. Rechargez la page.", 409);
      if (user.data()?.user_role !== "commercant") throw new MerchantError("Ce compte n’est plus associable.", 409);
      tx.update(shopRef, { owner: `/users/${candidate.account.uid}`, owner_id: candidate.user.ref, email: candidate.account.email });
    });
    return readMerchantAccount(merchantId);
  }
  const uid = ownerUid(shop.data()!);
  if (!uid || uid !== body.expectedOwner) throw new MerchantError("Le propriétaire a changé. Rechargez la page.", 409);
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  const before = await auth.getUser(uid);
  if (user.data()?.user_role !== "commercant" || before.customClaims?.admin || isAllowedAdminEmail(before.email)) throw new MerchantError("Seuls les comptes commerçants peuvent être gérés ici.", 403);
  if (body.action === "reset") return { email: before.email };
  if (body.action !== "update") throw new MerchantError("Action inconnue.");
  if (typeof body.active !== "boolean") throw new MerchantError("Statut invalide.");
  const first_name = textField(body.first_name, "Prénom", 100);
  const last_name = textField(body.last_name, "Nom", 100);
  const phone_number = textField(body.account_phone, "Téléphone", 50);
  const email = merchantEmail(body.email ?? before.email);
  if (isAllowedAdminEmail(email)) throw new MerchantError("Cette adresse est réservée à l’administration.", 409);
  const changingEmail = email !== before.email;
  const accountFields = { first_name, last_name, phone_number, email, account_status: body.active ? "active" : "inactive" };
  await auth.updateUser(uid, { email, ...(changingEmail ? { emailVerified: false } : {}), disabled: !body.active, displayName: [first_name, last_name].filter(Boolean).join(" ") || null });
  try {
    await db.runTransaction(async tx => {
      const current = await tx.get(shopRef);
      const currentUser = await tx.get(userRef);
      if (ownerUid(current.data()!) !== uid || currentUser.data()?.user_role !== "commercant") throw new MerchantError("L’association a changé. Rechargez la page.", 409);
      // The legacy rules also use enseigne.email as ownership identity. Update
      // every representation of this owner's shops in the same transaction.
      const related = changingEmail ? await Promise.all([
        tx.get(db.collection("enseignes").where("owner_id", "==", userRef)),
        tx.get(db.collection("enseignes").where("owner", "==", `/users/${uid}`)),
        tx.get(db.collection("enseignes").where("owner", "==", `users/${uid}`)),
        tx.get(db.collection("enseignes").where("owner", "==", userRef)),
      ]) : [];
      const shops = new Map(related.flatMap(snapshot => snapshot.docs.map(document => [document.id, document] as const)));
      for (const document of shops.values()) {
        if (ownerUid(document.data()) !== uid) throw new MerchantError("Un commerce possède une association incohérente. Corrigez-la avant de changer l’email.", 409);
      }
      tx.update(userRef, accountFields);
      for (const document of shops.values()) tx.update(document.ref, { email });
    });
  } catch (error) {
    let saved;
    try { saved = (await userRef.get()).data(); }
    catch { throw new MerchantError("Le résultat de la modification n’a pas pu être confirmé. Vérification technique nécessaire.", 500, "cleanup-required"); }
    if (Object.entries(accountFields).every(([key, value]) => saved?.[key] === value)) {
      if (!body.active || changingEmail) await auth.revokeRefreshTokens(uid);
      return readMerchantAccount(merchantId);
    }
    try { await auth.updateUser(uid, { email: before.email, emailVerified: before.emailVerified, disabled: before.disabled, displayName: before.displayName ?? null }); }
    catch { throw new MerchantError("La synchronisation du compte a échoué. Vérification technique nécessaire.", 500, "cleanup-required"); }
    throw error;
  }
  if (!body.active || changingEmail) await auth.revokeRefreshTokens(uid);
  return readMerchantAccount(merchantId);
}
