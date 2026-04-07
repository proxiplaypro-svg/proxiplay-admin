"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MerchantCard } from "@/components/admin/commercants/MerchantCard";
import { MerchantEditModal } from "@/components/admin/commercants/MerchantEditModal";
import { MerchantFilters } from "@/components/admin/commercants/MerchantFilters";
import { MerchantPanel } from "@/components/admin/commercants/MerchantPanel";
import {
  buildMerchantEmailLink,
  buildWhatsAppLink,
  getMerchantsPilotageData,
  getMerchantsPilotageErrorMessage,
  updateMerchantProfile,
} from "@/lib/firebase/merchantsQueries";
import type { MerchantPilotageFilter, MerchantPilotageItem, MerchantPilotageSort } from "@/types/dashboard";

const FOURTEEN_DAYS_IN_MS = 14 * 24 * 60 * 60 * 1000;

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function buildSubtitle(merchants: MerchantPilotageItem[]) {
  const total = merchants.length;
  const toFollowUp = merchants.filter((merchant) => {
    if (merchant.lastContactDateValue <= 0) {
      return true;
    }

    return Date.now() - merchant.lastContactDateValue > FOURTEEN_DAYS_IN_MS;
  }).length;
  const withoutActiveGame = merchants.filter((merchant) => merchant.gamesActiveCount === 0).length;

  return `${formatCount(total)} enseignes · ${formatCount(toFollowUp)} a relancer · ${formatCount(withoutActiveGame)} sans jeu actif`;
}

function matchesFilter(merchant: MerchantPilotageItem, filter: MerchantPilotageFilter) {
  switch (filter) {
    case "a_relancer":
      return merchant.status === "a_relancer";
    case "sans_jeu_actif":
      return merchant.gamesActiveCount === 0;
    case "actifs":
      return merchant.status === "actif";
    default:
      return true;
  }
}

function sortMerchants(items: MerchantPilotageItem[], sort: MerchantPilotageSort) {
  return [...items].sort((left, right) => {
    switch (sort) {
      case "last_contact_desc":
        return right.lastContactDateValue - left.lastContactDateValue || left.name.localeCompare(right.name, "fr");
      case "participations_desc":
        return right.participationsJ30 - left.participationsJ30 || left.name.localeCompare(right.name, "fr");
      case "name_asc":
        return left.name.localeCompare(right.name, "fr");
      default:
        return right.engagementScore - left.engagementScore || left.name.localeCompare(right.name, "fr");
    }
  });
}

function downloadCsv(merchants: MerchantPilotageItem[]) {
  const rows = [
    ["Nom", "Ville", "Email", "Telephone", "Statut", "Score", "Jeux actifs", "Participations J30", "Clics J30", "Gains remis", "Derniere relance"],
    ...merchants.map((merchant) => [
      merchant.name,
      merchant.city,
      merchant.email,
      merchant.phone,
      merchant.status,
      String(merchant.engagementScore),
      String(merchant.gamesActiveCount),
      String(merchant.participationsJ30),
      String(merchant.clicksJ30),
      String(merchant.gainsRemis),
      merchant.lastContactDateLabel,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `commercants-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminCommercantsPage() {
  const [merchants, setMerchants] = useState<MerchantPilotageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MerchantPilotageFilter>("tous");
  const [sort, setSort] = useState<MerchantPilotageSort>("score_desc");
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getMerchantsPilotageData();

        if (!cancelled) {
          setMerchants(data.merchants);
          setSelectedMerchantId((current) => current ?? data.merchants[0]?.id ?? null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
          setError(getMerchantsPilotageErrorMessage(fetchError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sortMerchants(
      merchants.filter((merchant) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          merchant.name.toLowerCase().includes(normalizedSearch) ||
          merchant.city.toLowerCase().includes(normalizedSearch) ||
          merchant.email.toLowerCase().includes(normalizedSearch);

        return matchesSearch && matchesFilter(merchant, filter);
      }),
      sort,
    );
  }, [filter, merchants, search, sort]);

  useEffect(() => {
    if (filteredMerchants.length === 0) {
      setSelectedMerchantId(null);
      return;
    }

    setSelectedMerchantId((current) =>
      current && filteredMerchants.some((merchant) => merchant.id === current)
        ? current
        : filteredMerchants[0]?.id ?? null,
    );
  }, [filteredMerchants]);

  const selectedMerchant =
    filteredMerchants.find((merchant) => merchant.id === selectedMerchantId) ??
    merchants.find((merchant) => merchant.id === selectedMerchantId) ??
    null;

  const stats = useMemo(() => {
    const total = merchants.length;
    const active = merchants.filter((merchant) => merchant.gamesActiveCount > 0).length;
    const noGame = merchants.filter((merchant) => merchant.gamesActiveCount === 0).length;
    const toFollowUp = merchants.filter((merchant) => {
      if (merchant.lastContactDateValue <= 0) {
        return true;
      }

      return Date.now() - merchant.lastContactDateValue > FOURTEEN_DAYS_IN_MS;
    }).length;
    const participations = merchants.reduce((sum, merchant) => sum + merchant.participationsJ30, 0);

    return { total, active, noGame, toFollowUp, participations };
  }, [merchants]);

  const whatsappHref = selectedMerchant
    ? buildWhatsAppLink(selectedMerchant.phone, selectedMerchant.name)
    : null;
  const emailHref = selectedMerchant
    ? buildMerchantEmailLink(selectedMerchant.email, selectedMerchant.name)
    : null;

  const handleOpenExternal = (href: string, target: "_blank" | "_self" = "_self") => {
    if (target === "_blank") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.href = href;
  };

  const handleEditSave = async (payload: {
    name: string;
    city: string;
    email: string;
    phone: string;
    commercialStatus: "" | "actif" | "a_relancer" | "inactif";
  }) => {
    if (!selectedMerchant) {
      return;
    }

    setEditSaving(true);
    setEditFeedback(null);

    try {
      await updateMerchantProfile({
        merchantId: selectedMerchant.id,
        merchantCollectionName: selectedMerchant.merchantCollectionName,
        ...payload,
      });

      setMerchants((current) =>
        current.map((merchant) =>
          merchant.id === selectedMerchant.id
            ? {
                ...merchant,
                name: payload.name.trim() || merchant.name,
                city: payload.city.trim(),
                email: payload.email.trim(),
                phone: payload.phone.trim(),
                commercialStatus: payload.commercialStatus,
              }
            : merchant,
        ),
      );

      setEditFeedback("Fiche marchand enregistree dans Firestore.");
      setEditOpen(false);
    } catch (saveError) {
      console.error(saveError);
      setEditFeedback(getMerchantsPilotageErrorMessage(saveError));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide grid gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="panel-heading">
              <h2>Commercants</h2>
              <p>{buildSubtitle(merchants)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="secondary-button inline-secondary-button w-auto min-w-[190px]"
              onClick={() => downloadCsv(filteredMerchants)}
            >
              Exporter CSV
            </button>
            <Link
              href="/admin/marchands/nouveau"
              className="primary-button inline-flex min-w-[220px] items-center justify-center"
              style={{ background: "linear-gradient(135deg, #639922 0%, #7CB32B 100%)", boxShadow: "0 16px 32px rgba(99,153,34,0.28)" }}
            >
              + Nouveau marchand
            </Link>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          {[
            {
              id: "active",
              label: "Enseignes actives",
              value: formatCount(stats.active),
              helper: `${formatCount(stats.total)} total`,
              borderColor: "#639922",
            },
            {
              id: "no-game",
              label: "Sans jeu actif",
              value: formatCount(stats.noGame),
              helper: "Aucun jeu en cours",
              borderColor: "#E24B4A",
            },
            {
              id: "follow-up",
              label: "A relancer",
              value: formatCount(stats.toFollowUp),
              helper: "Derniere relance > 14j",
              borderColor: "rgba(159,177,199,0.7)",
            },
            {
              id: "participations",
              label: "Participations J30",
              value: formatCount(stats.participations),
              helper: "Tous marchands",
              borderColor: "#4F7CFF",
            },
          ].map((card) => (
            <article
              key={card.id}
              className="rounded-[24px] border border-[rgba(159,177,199,0.08)] bg-[rgba(255,255,255,0.04)] p-5"
              style={{ boxShadow: `inset 4px 0 0 ${card.borderColor}` }}
            >
              <span className="text-[0.9rem] text-[var(--muted)]">{card.label}</span>
              <strong className="mt-3 block text-[2rem] leading-none">{card.value}</strong>
              <small className="mt-3 block text-[0.92rem] text-[var(--muted)]">{card.helper}</small>
            </article>
          ))}
        </div>

        <MerchantFilters
          filter={filter}
          sort={sort}
          search={search}
          onFilterChange={setFilter}
          onSortChange={setSort}
          onSearchChange={setSearch}
        />

        {loading ? (
          <div className="games-loader">
            <div className="loader" aria-hidden="true" />
            <p>Chargement des commercants Firestore...</p>
          </div>
        ) : null}

        {!loading && error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid content-start gap-4">
              {filteredMerchants.length === 0 ? (
                <div className="empty-state">
                  <strong>Aucun marchand a afficher</strong>
                  <p>La recherche ou les filtres actuels ne remontent aucune enseigne.</p>
                </div>
              ) : (
                filteredMerchants.map((merchant) => (
                  <MerchantCard
                    key={merchant.id}
                    merchant={merchant}
                    selected={merchant.id === selectedMerchantId}
                    onSelect={setSelectedMerchantId}
                  />
                ))
              )}
            </div>

            <MerchantPanel
              merchant={selectedMerchant}
              whatsappHref={whatsappHref}
              emailHref={emailHref}
              onEdit={() => {
                setEditFeedback(null);
                setEditOpen(true);
              }}
              onOpenExternal={handleOpenExternal}
            />
          </div>
        ) : null}
      </div>

      <MerchantEditModal
        merchant={selectedMerchant}
        open={editOpen}
        saving={editSaving}
        feedback={editFeedback}
        onClose={() => {
          setEditOpen(false);
          setEditFeedback(null);
        }}
        onSave={handleEditSave}
      />
    </section>
  );
}
