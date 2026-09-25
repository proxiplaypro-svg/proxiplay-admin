export const INSTANT_PREPARATION_ERROR =
  "Impossible de préparer les gains instantanés. Le jeu reste en brouillon. Réessayez.";

export type InstantCalendarResult = {
  ok: boolean;
  gameId: string;
  desiredCount: number;
  existingCount: number;
  createdCount: number;
  duplicateExistingKeys: string[];
  unexpectedExistingCount: number;
  hasAssignedInstantWinner: boolean;
};

export async function prepareGameRelaunch<T>(input: {
  gameId: string;
  counts: Array<string | number>;
  saveDraft: () => Promise<T>;
  generate: () => Promise<InstantCalendarResult>;
  verifyCalendar: () => Promise<void>;
  publish: () => Promise<void>;
}): Promise<T> {
  const expectedCount = input.counts.reduce<number>((sum, value) => {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Chaque quantité doit être un entier positif ou nul.");
    }
    return sum + count;
  }, 0);
  if (!Number.isSafeInteger(expectedCount)) {
    throw new Error("La quantité totale de lots est invalide.");
  }
  const saved = await input.saveDraft();
  if (expectedCount > 0) {
    try {
      const result = await input.generate();
      if (
        result.ok !== true || result.gameId !== input.gameId ||
        result.desiredCount !== expectedCount ||
        !Number.isSafeInteger(result.existingCount) || result.existingCount < 0 ||
        !Number.isSafeInteger(result.createdCount) || result.createdCount < 0 ||
        result.existingCount + result.createdCount !== expectedCount ||
        !Array.isArray(result.duplicateExistingKeys) || result.duplicateExistingKeys.length !== 0 ||
        result.unexpectedExistingCount !== 0 || result.hasAssignedInstantWinner !== false
      ) {
        throw new Error("Le serveur ne confirme pas un calendrier cohérent.");
      }

    } catch (cause) {
      throw new Error(INSTANT_PREPARATION_ERROR, { cause });
    }
  }
  try {
    await input.verifyCalendar();
  } catch (cause) {
    throw new Error(INSTANT_PREPARATION_ERROR, { cause });
  }
  await input.publish();
  return saved;
}
