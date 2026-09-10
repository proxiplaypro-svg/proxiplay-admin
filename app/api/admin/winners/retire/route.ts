import { NextResponse } from "next/server";

// Retired permanently: this route must never write prizes with the Admin SDK.
// The winners screen calls claimOperatorPrize with the operator's Firebase session.
export async function POST() {
  return NextResponse.json({error: "Cette voie de retrait est fermee. Utilisez la validation par code dans Gagnants."}, {status: 410});
}
