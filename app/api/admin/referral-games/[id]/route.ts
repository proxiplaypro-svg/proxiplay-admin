import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin-app";
import { assertIsAdminRequest, handleAdminAuthError } from "@/lib/firebase/adminAuth";

function parseTimestamp(value: unknown): Timestamp | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const seconds = typeof obj.seconds === "number" ? obj.seconds : null;
  const nanoseconds = typeof obj.nanoseconds === "number" ? obj.nanoseconds : 0;
  if (seconds === null) return null;
  return new Timestamp(seconds, nanoseconds);
}

const kAllowedStatuses = new Set(["draft", "active", "suspended", "ended"]);

// Status changes the Admin may make. "active" -> "draft" is not offered any
// more: autoManageReferralGames starts any draft whose start date is past, so
// a game sent back to draft came back within 15 minutes. "suspended" is never
// touched by the scheduler.
const kStatusTransitions: Record<string, readonly string[]> = {
  draft: ["active"],
  active: ["suspended", "ended"],
  suspended: ["active", "ended"],
  ended: [],
};

const kStatusLabels: Record<string, string> = {
  draft: "brouillon",
  active: "actif",
  suspended: "suspendu",
  ended: "termine",
};

function readMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

// A suspended game may come back only while it can still run normally.
function reactivationRefusal(game: Record<string, unknown>, nowMs: number): string | null {
  if (game.winner_uid || game.drawn_at || game.draw_status) {
    return "Ce jeu a deja ete tire : il ne peut plus etre reactive.";
  }
  const startMs = readMillis(game.start_date);
  const endMs = readMillis(game.end_date);
  if (startMs === null || endMs === null) return "Dates du jeu invalides.";
  if (endMs <= nowMs) return "La date de fin est passee : cloturez le jeu au lieu de le reactiver.";
  if (startMs > nowMs) return "La date de debut n'est pas encore atteinte.";
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const { start_date, end_date, status, enseigne_id, ...rest } = (await request.json()) as Record<
      string,
      unknown
    >;
    const db = getAdminDb();

    if (status !== undefined && !kAllowedStatuses.has(String(status))) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    if (status !== undefined) {
      const currentSnap = await db.collection("referral_games").doc(id).get();
      if (!currentSnap.exists) {
        return NextResponse.json({ error: "Jeu introuvable." }, { status: 404 });
      }
      const current = currentSnap.data() ?? {};
      const currentStatus = String(current.status ?? "draft");
      if (status !== currentStatus) {
        if (!(kStatusTransitions[currentStatus] ?? []).includes(String(status))) {
          return NextResponse.json(
            {
              error: `Changement de statut impossible : ${kStatusLabels[currentStatus] ?? currentStatus} -> ${kStatusLabels[String(status)]}.`,
            },
            { status: 409 },
          );
        }
        if (currentStatus === "suspended" && status === "active") {
          const refusal = reactivationRefusal(current, Date.now());
          if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
        }
      }
    }

    if (status === "active") {
      // Un seul jeu de parrainage actif a la fois : evite les tickets
      // ambigus si un admin en activait deux simultanement par erreur.
      const otherActiveSnap = await db
        .collection("referral_games")
        .where("status", "==", "active")
        .get();
      const otherActiveIds = otherActiveSnap.docs
        .map((doc) => doc.id)
        .filter((docId) => docId !== id);
      if (otherActiveIds.length > 0) {
        return NextResponse.json(
          {
            error:
              "Un autre jeu de parrainage est deja actif. Terminez-le avant d'en activer un nouveau.",
          },
          { status: 409 },
        );
      }
    }

    // enseigne_id est facultatif : simple id de document (pas un chemin),
    // converti ici en vraie DocumentReference Firestore — meme convention
    // que GamesRecord.enseigneId cote app joueur. Absent du payload =
    // champ inchange ; chaine vide = retire le partenaire (FieldValue.delete).
    const enseigneIdUpdate =
      enseigne_id === undefined
        ? {}
        : typeof enseigne_id === "string" && enseigne_id.trim()
          ? { enseigne_id: db.collection("enseignes").doc(enseigne_id.trim()) }
          : { enseigne_id: FieldValue.delete() };

    await db
      .collection("referral_games")
      .doc(id)
      .update({
        ...rest,
        ...(status !== undefined && { status }),
        ...(start_date !== undefined && { start_date: parseTimestamp(start_date) }),
        ...(end_date !== undefined && { end_date: parseTimestamp(end_date) }),
        ...enseigneIdUpdate,
        updated_at: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[REFERRAL_GAME_UPDATE]", error);
    return NextResponse.json(
      { error: "Impossible de mettre a jour le jeu de parrainage." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertIsAdminRequest(request);
    const { id } = await params;
    const db = getAdminDb();

    const [gameSnap, entriesSnap, prizesSnap] = await Promise.all([
      db.collection("referral_games").doc(id).get(),
      db.collection("referral_games").doc(id).collection("entries").get(),
      db.collection("prizes").where("referral_game_id", "==", id).get(),
    ]);
    if (!gameSnap.exists) return NextResponse.json({ error: "Jeu introuvable." }, { status: 404 });
    const game = gameSnap.data() ?? {};
    const hasDrawResult = Boolean(
      game.winner_uid || game.winner_ref || game.prize_ref || game.drawn_at || game.draw_status,
    );
    // Le statut (brouillon/actif/termine) n'est plus une condition : un jeu
    // actif ou termine peut etre supprime (utile pour nettoyer un jeu de
    // test lance par erreur), tant qu'aucun participant ni gain reel n'y
    // est attache — ca reste bloque pour eviter de perdre des tickets ou
    // un gagnant deja tire.
    if (hasDrawResult || !entriesSnap.empty || !prizesSnap.empty) {
      return NextResponse.json(
        { error: "Seul un jeu sans participant ni gain peut etre supprime." },
        { status: 409 },
      );
    }
    // A game players may see (active) or may see again (suspended) is only
    // deleted when its exact title is typed again.
    if (game.status === "active" || game.status === "suspended") {
      const body = (await request.json().catch(() => null)) as { confirm_title?: unknown } | null;
      const typed = typeof body?.confirm_title === "string" ? body.confirm_title.trim() : "";
      if (!typed || typed !== String(game.title ?? "").trim()) {
        return NextResponse.json(
          { error: "Saisissez le titre exact du jeu pour confirmer la suppression." },
          { status: 400 },
        );
      }
    }

    const CHUNK = 490;
    const allRefs = [
      ...entriesSnap.docs.map((d) => d.ref),
      ...prizesSnap.docs.map((d) => d.ref),
      db.collection("referral_games").doc(id),
    ];

    for (let i = 0; i < allRefs.length; i += CHUNK) {
      const batch = db.batch();
      allRefs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = handleAdminAuthError(error);
    if (authError) return authError;
    console.error("[REFERRAL_GAME_DELETE]", error);
    return NextResponse.json(
      { error: "Impossible de supprimer le jeu de parrainage." },
      { status: 500 },
    );
  }
}
