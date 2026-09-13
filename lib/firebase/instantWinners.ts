import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./client-app";

// Point d'appel unique pour generateInstantWinnersForGame : evite que
// plusieurs ecrans finissent par appeler un nom de Function ou une region
// divergente (voir backfillInstantWinnersForGame / europe-west1, qui
// n'a jamais existe cote backend).
const instantWinnersFunctions = getFunctions(firebaseApp, "us-central1");

export type GenerateInstantWinnersPayload = {
  gameId: string;
};

export type GenerateInstantWinnersResult = {
  ok?: boolean;
  status?: string;
  createdCount?: number;
  desiredCount?: number;
  existingCount?: number;
};

const generateInstantWinnersCallable = httpsCallable<
  GenerateInstantWinnersPayload,
  GenerateInstantWinnersResult
>(instantWinnersFunctions, "generateInstantWinnersForGame");

export async function generateInstantWinnersForGame(gameId: string) {
  const response = await generateInstantWinnersCallable({ gameId });
  return response.data;
}
