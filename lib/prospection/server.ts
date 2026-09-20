import { type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "../firebase/admin-app";
import { duplicateOf, normalize, parseFields, ProspectError, record, text, type Duplicate, type Prospect, type ProspectFields } from "./model";
import { factualDraftProvider, qualifyProspect } from "./qualification";

type Entry = { id: string; kind: Duplicate["kind"]; data: Record<string, unknown> };
export class ProspectService {
  constructor(private db: Firestore = getAdminDb()) {}
  private ref(id: string) { if (!/^[\w-]{1,200}$/.test(id)) throw new ProspectError("Identifiant invalide."); return this.db.collection("prospects").doc(id); }
  private async entries(transaction?: Transaction): Promise<Entry[]> {
    const read = async (collection: string, kind: Entry["kind"]) => {
      const query = this.db.collection(collection);
      const snapshot = transaction ? await transaction.get(query) : await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, kind, data: doc.data() }));
    };
    return [...await read("enseignes", "client"), ...await read("merchants", "client"), ...await read("prospects", "prospect")];
  }
  async list() {
    const snapshot = await this.db.collection("prospects").orderBy("created_at", "desc").get();
    return snapshot.docs.filter(doc => !doc.data().deleting).map(doc => ({ ...doc.data(), id: doc.id } as Prospect));
  }
  async merchants() {
    const snapshot = await this.db.collection("enseignes").get();
    return snapshot.docs.map(doc => ({ id: doc.id, name: String(doc.data().name || "Enseigne"), city: String(doc.data().city || "") }));
  }
  async detail(id: string) {
    const ref = this.ref(id); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.deleting) throw new ProspectError("Prospect introuvable.", 404);
    const history = await ref.collection("history").orderBy("at", "desc").get();
    return { prospect: { ...snapshot.data(), id }, history: history.docs.map(doc => ({ ...doc.data(), id: doc.id })) };
  }
  async annotate(candidates: ProspectFields[]) {
    const entries = await this.entries();
    return candidates.map(candidate => ({ ...candidate, duplicate: duplicateOf(candidate, entries) }));
  }
  async createMany(inputs: unknown[], actor: string) {
    if (!inputs.length || inputs.length > 60) throw new ProspectError("Sélectionnez entre 1 et 60 entreprises.");
    const candidates = inputs.map(input => parseFields(input));
    if (candidates.some(candidate => candidate.status !== "new" || candidate.converted_enseigne_id)) throw new ProspectError("Un nouveau prospect doit avoir le statut Nouveau.");
    const refs = candidates.map(() => this.db.collection("prospects").doc());
    return this.db.runTransaction(async transaction => {
      // All module writes share this lock, including first inserts and concurrent imports.
      const lock = this.db.doc("prospection_internal/write_lock"); await transaction.get(lock);
      const entries = await this.entries(transaction);
      const created: string[] = []; const skipped: { name: string; duplicate: Duplicate }[] = [];
      candidates.forEach((candidate, index) => {
        const duplicate = duplicateOf(candidate, entries);
        if (duplicate) { skipped.push({ name: candidate.name, duplicate }); return; }
        const now = new Date().toISOString(); const ref = refs[index];
        const data = { ...candidate, normalized_name: normalize(candidate.name), created_at: now, updated_at: now, revision: 1, qualification: null, qualification_provider: null };
        transaction.create(ref, data);
        transaction.create(ref.collection("history").doc(), { action: "created", actor, at: now, detail: "Prospect créé" });
        entries.push({ id: ref.id, kind: "prospect", data }); created.push(ref.id);
      });
      transaction.set(lock, { updated_at: new Date().toISOString() });
      return { created, skipped };
    });
  }
  async update(id: string, input: unknown, actor: string) {
    const body = record(input); const action = text(body.action) || "update";
    if (!["update", "note", "call", "qualify"].includes(action)) throw new ProspectError("Action inconnue.");
    const ref = this.ref(id);
    let qualification: Awaited<ReturnType<typeof qualifyProspect>> | undefined;
    if (action === "qualify") {
      const current = await ref.get(); if (!current.exists) throw new ProspectError("Prospect introuvable.", 404);
      qualification = await qualifyProspect(current.data() as ProspectFields);
    }
    return this.db.runTransaction(async transaction => {
      const lock = this.db.doc("prospection_internal/write_lock"); await transaction.get(lock);
      const snapshot = await transaction.get(ref); const current = snapshot.data();
      if (!current || current.deleting) throw new ProspectError("Prospect introuvable.", 404);
      if (body.revision !== current.revision) throw new ProspectError("Cette fiche a changé. Rechargez-la avant de réessayer.", 409);
      const now = new Date().toISOString();
      let changes: Record<string, unknown> = {}; let detail = "Fiche modifiée";
      if (action === "update") {
        const fields = parseFields({ ...current, ...record(body.fields) });
        const entries = await this.entries(transaction);
        const duplicate = duplicateOf(fields, entries.filter(entry => !(entry.kind === "prospect" && entry.id === id) && !(entry.kind === "client" && entry.id === fields.converted_enseigne_id)));
        if (duplicate) throw new ProspectError(duplicate.kind === "client" ? "Déjà client Proxiplay : associez cette fiche à l’enseigne correspondante." : `Doublon possible avec ${duplicate.name}. Aucune fusion effectuée.`, 409);
        if (fields.converted_enseigne_id) {
          const merchant = await transaction.get(this.db.doc(`enseignes/${fields.converted_enseigne_id}`));
          if (!merchant.exists) throw new ProspectError("Enseigne introuvable.");
        }
        if (fields.status === "client" && !fields.converted_enseigne_id) throw new ProspectError("Associez le client à une enseigne existante.");
        changes = fields;
        const changed = Object.keys(fields).filter(key => JSON.stringify(current[key]) !== JSON.stringify((fields as Record<string, unknown>)[key]));
        detail = changed.map(key => key === "status" ? `Statut : ${current.status} → ${fields.status}` : key === "converted_enseigne_id" ? `Enseigne associée : ${fields.converted_enseigne_id || "aucune"}` : key).join(", ") || "Aucune modification";
      } else if (action === "note") {
        detail = text(body.note, 10000); if (!detail) throw new ProspectError("La note est vide.");
      } else if (action === "call") { changes.last_contact_at = now; detail = "Appel effectué (déclaré par l’administrateur)"; }
      else { changes = { qualification, qualification_provider: factualDraftProvider.name, suggested_angle: qualification!.suggested_angle || "", suggested_message: qualification!.suggested_message || "" }; detail = "Brouillon factuel généré (sans IA externe)"; }
      transaction.update(ref, { ...changes, normalized_name: normalize(String(changes.name || current.name)), updated_at: now, revision: current.revision + 1 });
      transaction.create(ref.collection("history").doc(), { action, actor, at: now, detail });
      transaction.set(lock, { updated_at: now });
      return { id };
    });
  }
  async remove(id: string, revision: unknown) {
    const ref = this.ref(id);
    await this.db.runTransaction(async transaction => {
      const lock = this.db.doc("prospection_internal/write_lock"); await transaction.get(lock);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new ProspectError("Prospect introuvable.", 404);
      if (snapshot.data()?.revision !== revision) throw new ProspectError("Cette fiche a changé. Rechargez-la.", 409);
      transaction.update(ref, { deleting: true }); transaction.set(lock, { updated_at: new Date().toISOString() });
    });
    // Tombstone prevents concurrent edits during recursive history deletion. Retry is safe.
    await this.db.recursiveDelete(ref);
    return { deleted: id };
  }
}
