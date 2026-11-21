export const PLAYER_PUSH_BATCH_SIZE = 50;

export type PlayerPushBatch = {
  number: number;
  uids: string[];
  userRefs: string[];
};

export type PlayerPushBatchResult = PlayerPushBatch & {
  status: "created" | "error" | "uncertain";
  documentId: string | null;
  message: string | null;
};

export function buildPlayerPushBatches(userIds: string[]): PlayerPushBatch[] {
  const unique = [...new Set(userIds.map((id) => id.trim().replace(/^users\//, "")))];
  if (!unique.length || unique.some((id) => !id || id.includes("/") || id.includes(","))) {
    throw new Error("La sélection contient un identifiant joueur invalide.");
  }

  const batches: PlayerPushBatch[] = [];
  for (let index = 0; index < unique.length; index += PLAYER_PUSH_BATCH_SIZE) {
    const uids = unique.slice(index, index + PLAYER_PUSH_BATCH_SIZE);
    batches.push({ number: batches.length + 1, uids, userRefs: uids.map((uid) => `users/${uid}`) });
  }
  return batches;
}

const DEFINITE_REJECTION_CODES = new Set([
  "functions/invalid-argument",
  "functions/unauthenticated",
  "functions/permission-denied",
  "functions/not-found",
]);

export function classifyPlayerPushError(error: unknown): "error" | "uncertain" {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return DEFINITE_REJECTION_CODES.has(code) ? "error" : "uncertain";
}

export async function runPlayerPushBatches(
  batches: PlayerPushBatch[],
  create: (userRefs: string[]) => Promise<{ ok: boolean; id: string }>,
  onResult: (result: PlayerPushBatchResult) => void,
): Promise<PlayerPushBatchResult[]> {
  const results: PlayerPushBatchResult[] = [];
  for (const batch of batches) {
    let result: PlayerPushBatchResult;
    try {
      const response = await create(batch.userRefs);
      result = response?.ok === true && typeof response.id === "string" && response.id.trim()
        ? { ...batch, status: "created", documentId: response.id, message: null }
        : { ...batch, status: "uncertain", documentId: null, message: "Réponse sans identifiant de document." };
    } catch (error) {
      result = {
        ...batch,
        status: classifyPlayerPushError(error),
        documentId: null,
        message: error instanceof Error ? error.message : "Erreur non détaillée.",
      };
    }
    results.push(result);
    onResult(result);
  }
  return results;
}
