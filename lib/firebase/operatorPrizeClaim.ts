import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./client-app";

export type OperatorClaimInput = { prizeId: string; winnerId: string; code: string; requestId: string };
export const operatorFunctions = getFunctions(firebaseApp, "us-central1");
export async function claimOperatorPrizeAction(input: OperatorClaimInput) {
  const result = await httpsCallable<OperatorClaimInput, {status: "claimed" | "already_claimed"; prizeId: string}>(
    operatorFunctions, "claimOperatorPrize")(input);
  return result.data;
}
