import { NextResponse } from "next/server";

type FirestoreValue =
  | { stringValue?: string }
  | { nullValue?: null }
  | { booleanValue?: boolean }
  | { integerValue?: string }
  | { doubleValue?: number }
  | { timestampValue?: string }
  | { mapValue?: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue?: { values?: FirestoreValue[] } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
};

const FIRESTORE_REST_BASE =
  "https://firestore.googleapis.com/v1/projects/proxi-play-odzp2e/databases/(default)/documents";

function readText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function getDocumentId(name?: string) {
  if (!name) {
    return "";
  }

  const segments = name.split("/");
  return segments[segments.length - 1] ?? "";
}

function getStringValue(fields: Record<string, FirestoreValue> | undefined, key: string) {
  const value = fields?.[key];
  if (!value || !("stringValue" in value)) {
    return null;
  }

  return value.stringValue?.trim() || null;
}

function formatDateValue(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    options ?? {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Impossible de charger le detail de l animation.";
}

async function fetchFirestoreJson<T>(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Firestore REST request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const animationId = id.trim();

    if (!animationId || animationId.includes("/")) {
      return NextResponse.json(
        { error: "animationId invalide." },
        { status: 400 },
      );
    }

    const gamesUrl = `${FIRESTORE_REST_BASE}/games?pageSize=50&orderBy=animation_id`;
    const winnerUrl = `${FIRESTORE_REST_BASE}/animations/${encodeURIComponent(animationId)}/winner/current`;

    const [gamesResponse, winnerResponse] = await Promise.all([
      fetchFirestoreJson<FirestoreListResponse>(gamesUrl),
      fetchFirestoreJson<FirestoreDocument>(winnerUrl),
    ]);

    const games =
      gamesResponse?.documents
        ?.filter((document) => getStringValue(document.fields, "animation_id") === animationId)
        .map((document) => {
          const fields = document.fields;

          return {
            id: getDocumentId(document.name),
            animation_id: getStringValue(fields, "animation_id"),
            campaign_id: getStringValue(fields, "campaign_id"),
            title: readText(
              getStringValue(fields, "name"),
              getStringValue(fields, "title"),
              "Jeu sans nom",
            ),
            merchantId: readText(
              getStringValue(fields, "merchant_id"),
              getStringValue(fields, "enseigne_id"),
            ) || null,
            merchantName:
              readText(
                getStringValue(fields, "enseigne_name"),
                getStringValue(fields, "merchantName"),
              ) || "Commerce inconnu",
          };
        }) ?? [];

    const winnerFields = winnerResponse?.fields;
    const winnerUid = getStringValue(winnerFields, "uid");
    const winner = winnerUid
      ? {
          uid: winnerUid,
          label: readText(getStringValue(winnerFields, "label"), "Gagnant inconnu"),
          email: readText(getStringValue(winnerFields, "email"), "-"),
          selectedAtLabel: formatDateValue(getStringValue(winnerFields, "selected_at"), {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }
      : null;

    return NextResponse.json({
      games,
      prizes: [],
      qualifiedUsers: [],
      winner,
    });
  } catch (error) {
    console.error("Animation detail API failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
