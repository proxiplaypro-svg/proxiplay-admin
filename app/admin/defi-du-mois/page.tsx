"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase/client-app";
import { canonicalFunctionsClient } from "@/lib/firebase/functions";
import {
  challengeStatus,
  emptyForm,
  formFromConfig,
  isLocked,
  payloadFromForm,
  stateFromConfig,
  STATUS_LABEL,
  validateForm,
  type MonthlyChallengeForm,
  type MonthlyChallengeState,
  type MonthlyChallengeType,
} from "@/lib/admin/monthlyChallenge";

type Shop = { id: string; name: string };
type Stats = { startedCount?: number; qualifiedCount?: number; averageActiveDays?: number; drawStatus?: string; eligibleCount?: number; winnerUid?: string };

const getConfig = httpsCallable<{ type: MonthlyChallengeType; month: string }, Record<string, unknown>>(canonicalFunctionsClient, "adminGetMonthlyChallengeConfig");
const upsertConfig = httpsCallable<Record<string, unknown>, { ok: boolean }>(canonicalFunctionsClient, "adminUpsertMonthlyChallenge");
const getStats = httpsCallable<{ type: MonthlyChallengeType; month: string }, { stats: Stats }>(canonicalFunctionsClient, "adminGetMonthlyChallengeStats");

const TYPE_LABEL: Record<MonthlyChallengeType, string> = { attendance: "Défi du mois", merchant: "Commerçant du mois" };

function currentParisMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return message && !message.startsWith("internal") ? message : fallback;
}

export default function AdminMonthlyChallengePage() {
  const [type, setType] = useState<MonthlyChallengeType>("attendance");
  const [month, setMonth] = useState(currentParisMonth);
  const [form, setForm] = useState<MonthlyChallengeForm>(() => emptyForm("attendance", currentParisMonth()));
  const [state, setState] = useState<MonthlyChallengeState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void getDocs(collection(db, "enseignes")).then((snapshot) => setShops(snapshot.docs
      .map((document) => ({ id: document.id, name: String(document.data().name ?? "").trim() || document.id }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))))
      .catch(() => setShops([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setFeedback(null);
    try {
      const config = (await getConfig({ type, month })).data;
      setForm(formFromConfig(config, type, month));
      setState(stateFromConfig(config, String(config.draw_status ?? "")));
      setStats((await getStats({ type, month })).data.stats);
    } catch (loadError) {
      setError(errorMessage(loadError, "Impossible de charger le défi. Vérifiez votre connexion admin."));
    } finally { setLoading(false); }
  }, [type, month]);

  useEffect(() => { void load(); }, [load]);

  const status = state ? challengeStatus(state) : "draft";
  const locked = state ? isLocked(state) : false;
  const partnerName = useMemo(() => shops.find((shop) => shop.id === form.partnerShopId)?.name ?? "", [shops, form.partnerShopId]);

  async function save() {
    const invalid = validateForm(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null); setFeedback(null);
    try {
      await upsertConfig(payloadFromForm(form, partnerName));
      setFeedback("Défi enregistré.");
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError, "Enregistrement impossible."));
    } finally { setSaving(false); }
  }

  async function cancelChallenge() {
    if (!window.confirm("Annuler ce défi ? La progression s'arrête et AUCUN tirage n'aura lieu, même pour les joueurs déjà qualifiés. Cette action est enregistrée.")) return;
    setSaving(true); setError(null); setFeedback(null);
    try {
      await upsertConfig({ ...payloadFromForm({ ...form, enabled: false }, partnerName), cancel: true });
      setFeedback("Défi annulé.");
      await load();
    } catch (cancelError) {
      setError(errorMessage(cancelError, "Annulation impossible."));
    } finally { setSaving(false); }
  }

  const field = "rounded border px-3 py-2";
  const change = (patch: Partial<MonthlyChallengeForm>) => setForm((previous) => ({ ...previous, ...patch }));

  return <main className="space-y-6 p-6">
    <div>
      <h1 className="text-[22px] font-medium tracking-[-0.02em] text-[#1a1a1a]">Défi du mois</h1>
      <p className="mt-1 max-w-3xl text-sm text-[#666]">
        Les joueurs qui jouent le nombre de jours demandé pendant la période participent au tirage au sort.
        Toutes les parties comptent, sur tous les jeux. Avec un commerçant partenaire, le lot est à retirer chez lui ;
        sans partenaire, c&apos;est un jeu ProxiPlay et le lot est remis par ProxiPlay.
      </p>
    </div>

    <section className="flex flex-wrap items-end gap-4 rounded-xl border border-[#dfe4d8] bg-white p-5">
      <label className="grid gap-1 text-sm">Type
        <select value={type} onChange={(event) => setType(event.target.value as MonthlyChallengeType)} className={field}>
          <option value="attendance">{TYPE_LABEL.attendance}</option>
          <option value="merchant">{TYPE_LABEL.merchant}</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Mois
        <input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} className={field} />
      </label>
      <p className="text-sm">Statut : <strong>{loading ? "…" : STATUS_LABEL[status]}</strong></p>
    </section>

    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {feedback && <p className="rounded border border-[#C0DD97] bg-[#F4F9EC] p-3 text-sm text-[#2E5A0C]">{feedback}</p>}

    {!loading && <section className="rounded-xl border border-[#dfe4d8] bg-white p-6">
      <h2 className="text-lg font-semibold">{TYPE_LABEL[type]} — {month}</h2>
      {locked && <p className="mt-2 text-sm text-amber-800">Ce défi a commencé : la période, l&apos;objectif et l&apos;activation sont figés jusqu&apos;au tirage. Pour l&apos;arrêter sans tirage, utilisez « Annuler le défi ».</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Début<input type="date" value={form.startDate} disabled={locked} onChange={(event) => change({ startDate: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm">Fin<input type="date" value={form.endDate} disabled={locked} onChange={(event) => change({ endDate: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm">Objectif (jours de jeu différents)<input type="number" min="1" value={form.targetDays} disabled={locked} onChange={(event) => change({ targetDays: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm">Commerçant partenaire {type === "attendance" && <span className="text-xs text-[#666]">(facultatif)</span>}
          <select value={form.partnerShopId} onChange={(event) => change({ partnerShopId: event.target.value })} className={field}>
            <option value="">{type === "merchant" ? "Choisir un commerçant" : "Aucun — jeu ProxiPlay"}</option>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">Titre<input value={form.title} onChange={(event) => change({ title: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Description<textarea value={form.description} onChange={(event) => change({ description: event.target.value })} className={field} rows={3} /></label>
        <label className="grid gap-1 text-sm">Lot à gagner<input value={form.prizeTitle} onChange={(event) => change({ prizeTitle: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm">Valeur du lot (€)<input type="number" min="0" value={form.prizeValue} onChange={(event) => change({ prizeValue: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Description du lot<input value={form.prizeDescription} onChange={(event) => change({ prizeDescription: event.target.value })} className={field} /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Image (URL)<input type="url" value={form.imageUrl} onChange={(event) => change({ imageUrl: event.target.value })} className={field} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} disabled={locked} onChange={(event) => change({ enabled: event.target.checked })} />Défi actif</label>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-[#639922] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Enregistrement…" : "Enregistrer"}</button>
        {locked && <button type="button" disabled={saving} onClick={() => void cancelChallenge()} className="rounded border border-red-300 px-4 py-2 text-sm text-red-700">Annuler le défi</button>}
      </div>
    </section>}

    {!loading && stats && <section className="rounded-xl border border-[#dfe4d8] bg-white p-6">
      <h2 className="text-lg font-semibold">Suivi</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-[#666]">Joueurs ayant commencé</dt><dd className="text-xl">{stats.startedCount ?? 0}</dd></div>
        <div><dt className="text-[#666]">Qualifiés</dt><dd className="text-xl">{stats.qualifiedCount ?? 0}</dd></div>
        <div><dt className="text-[#666]">Moyenne de jours</dt><dd className="text-xl">{stats.averageActiveDays ?? 0}</dd></div>
        <div><dt className="text-[#666]">Tirage</dt><dd className="text-xl">{stats.drawStatus === "completed" ? "Effectué" : stats.drawStatus === "no_eligible_users" ? "Sans qualifié" : "À venir"}</dd></div>
      </dl>
    </section>}
  </main>;
}
