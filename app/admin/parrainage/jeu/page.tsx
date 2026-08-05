"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client-app";
import { auth } from "@/lib/firebase/auth";

type ReferralGameStatus = "draft" | "active" | "ended";

type ReferralGame = {
  id: string;
  title: string;
  description: string;
  prizeDescription: string;
  status: ReferralGameStatus;
  startDate: string | null;
  endDate: string | null;
  ticketCount: number;
  winnerTicketCount: number | null;
  totalTicketCount: number | null;
  winnerUid: string | null;
};

function readTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapReferralGame(id: string, data: Record<string, unknown>): ReferralGame {
  return {
    id,
    title: readText(data.title) || "Sans titre",
    description: readText(data.description),
    prizeDescription: readText(data.prize_description),
    status: (["draft", "active", "ended"] as const).includes(data.status as ReferralGameStatus)
      ? (data.status as ReferralGameStatus)
      : "draft",
    startDate: readTimestamp(data.start_date)?.toDate().toISOString() ?? null,
    endDate: readTimestamp(data.end_date)?.toDate().toISOString() ?? null,
    ticketCount: readNumber(data.ticket_count),
    winnerTicketCount: data.winner_ticket_count != null ? readNumber(data.winner_ticket_count) : null,
    totalTicketCount: data.total_ticket_count != null ? readNumber(data.total_ticket_count) : null,
    winnerUid: readText(data.winner_uid) || null,
  };
}

function formatDisplayDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR");
}

function parseDateInputToTimestampPayload(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
}

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion admin requise.");
  return user.getIdToken();
}

async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

const statusLabels: Record<ReferralGameStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  ended: "Termine",
};

const emptyForm = {
  title: "",
  description: "",
  prizeDescription: "",
  startDate: "",
  endDate: "",
};

export default function AdminReferralGamePage() {
  const [games, setGames] = useState<ReferralGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const referralGamesQuery = query(collection(db, "referral_games"), orderBy("start_date", "desc"));
    const unsubscribe = onSnapshot(
      referralGamesQuery,
      (snapshot) => {
        setGames(snapshot.docs.map((doc) => mapReferralGame(doc.id, doc.data())));
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Impossible de charger les jeux de parrainage.");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const hasActiveGame = useMemo(() => games.some((game) => game.status === "active"), [games]);

  const handleCreate = async () => {
    setSubmitting(true);
    setFeedback(null);
    setActionError(null);

    try {
      if (!formState.title.trim()) {
        throw new Error("Le titre est obligatoire.");
      }
      const startPayload = parseDateInputToTimestampPayload(formState.startDate);
      const endPayload = parseDateInputToTimestampPayload(formState.endDate);
      if (!startPayload || !endPayload) {
        throw new Error("Les dates de debut et de fin sont obligatoires.");
      }

      const response = await adminFetch("/api/admin/referral-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formState.title.trim(),
          description: formState.description.trim(),
          prize_description: formState.prizeDescription.trim(),
          start_date: startPayload,
          end_date: endPayload,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de creer le jeu de parrainage.");
      }

      setFormState(emptyForm);
      setFeedback("Jeu de parrainage cree en brouillon.");
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : "Impossible de creer le jeu de parrainage.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (game: ReferralGame) => {
    setActionError(null);
    try {
      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible d'activer ce jeu.");
      }
    } catch (activateError) {
      setActionError(
        activateError instanceof Error ? activateError.message : "Impossible d'activer ce jeu.",
      );
    }
  };

  const handleDelete = async (game: ReferralGame) => {
    if (!window.confirm(`Supprimer le jeu de parrainage "${game.title}" ?`)) return;
    setActionError(null);
    try {
      const response = await adminFetch(`/api/admin/referral-games/${game.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error?.trim() || "Impossible de supprimer ce jeu.");
      }
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : "Impossible de supprimer ce jeu.",
      );
    }
  };

  return (
    <section className="content-grid">
      <div className="panel panel-wide">
        <div className="panel-heading">
          <h2>Jeu de parrainage</h2>
          <p>
            Un ticket est cree automatiquement pour chaque parrainage valide (le filleul cree son
            compte) tant qu&apos;un jeu est actif -- sans plafond. Le tirage au sort se fait
            automatiquement a la date de fin. Un seul jeu actif a la fois.
          </p>
          <p>
            <Link className="secondary-button" href="/admin/parrainage">
              Retour au suivi parrainage
            </Link>
          </p>
        </div>
      </div>

      <div className="panel panel-wide">
        <form
          className="game-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="panel-heading">
            <h3>Nouveau jeu (brouillon)</h3>
            {hasActiveGame ? (
              <p className="feedback neutral">
                Un jeu est deja actif -- le nouveau jeu restera en brouillon jusqu&apos;a ce que
                vous terminiez le jeu actif.
              </p>
            ) : null}
          </div>

          <div className="game-edit-grid">
            <label className="game-edit-field">
              <span className="search-label">Titre</span>
              <input
                className="search-input"
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Grand tirage parrainage ete 2026"
              />
            </label>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Description (affichee au joueur)</span>
              <textarea
                className="game-edit-textarea"
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
              />
            </label>

            <label className="game-edit-field game-edit-field-wide">
              <span className="search-label">Lot a gagner</span>
              <input
                className="search-input"
                type="text"
                value={formState.prizeDescription}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, prizeDescription: event.target.value }))
                }
                placeholder="Un week-end pour deux"
              />
            </label>

            <label className="game-edit-field">
              <span className="search-label">Debut</span>
              <input
                className="search-input"
                type="date"
                value={formState.startDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </label>
            <label className="game-edit-field">
              <span className="search-label">Fin (tirage au sort a cette date)</span>
              <input
                className="search-input"
                type="date"
                value={formState.endDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </label>
          </div>

          {actionError ? <p className="feedback error">{actionError}</p> : null}
          {feedback ? <p className="feedback success">{feedback}</p> : null}

          <div className="dashboard-actions game-edit-actions">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Creation..." : "Creer en brouillon"}
            </button>
          </div>
        </form>
      </div>

      <div className="panel panel-wide">
        {loading ? <p className="feedback neutral">Chargement des jeux de parrainage...</p> : null}
        {error ? <p className="feedback error">{error}</p> : null}

        {!loading && !error ? (
          <div className="games-table-body">
            {games.length === 0 ? (
              <p className="feedback neutral">Aucun jeu de parrainage pour le moment.</p>
            ) : null}

            {games.map((game) => (
              <article key={game.id} className="games-table-row">
                <div className="games-cell" data-label="Titre">
                  <strong>{game.title}</strong>
                  <span>{game.prizeDescription || "Lot non renseigne"}</span>
                </div>
                <div className="games-cell" data-label="Statut">
                  <span className={`referral-status-badge ${game.status}`}>
                    {statusLabels[game.status]}
                  </span>
                </div>
                <div className="games-cell" data-label="Periode">
                  <span>
                    {formatDisplayDate(game.startDate)} → {formatDisplayDate(game.endDate)}
                  </span>
                </div>
                <div className="games-cell" data-label="Tickets">
                  <strong>{game.ticketCount}</strong>
                  {game.status === "ended" && game.winnerUid ? (
                    <span>
                      Gagnant : {game.winnerTicketCount ?? "?"}/{game.totalTicketCount ?? "?"} tickets
                    </span>
                  ) : null}
                </div>
                <div className="games-cell referral-actions-cell" data-label="Actions">
                  {game.status === "draft" ? (
                    <button type="button" className="secondary-button" onClick={() => handleActivate(game)}>
                      Activer
                    </button>
                  ) : null}
                  {game.status !== "active" ? (
                    <button type="button" className="secondary-button" onClick={() => handleDelete(game)}>
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
