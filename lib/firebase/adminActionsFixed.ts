"use client";

import type { DuplicateGamePayload } from "./adminActions";
import { duplicateGameDocument, type DuplicateGameResult } from "./gamesQueriesFixed";

export * from "./adminActions";

/** Uses the integrity-safe duplicate implementation while preserving the adminActions API. */
export async function duplicateGame(
  payload: DuplicateGamePayload,
): Promise<DuplicateGameResult> {
  return duplicateGameDocument(
    payload,
    payload.merchantCollectionName ?? "enseignes",
  );
}
