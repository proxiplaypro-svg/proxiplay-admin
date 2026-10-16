export function getNewGamePostCreationRoute(merchantId: string) {
  return `/admin/games?merchantId=${encodeURIComponent(merchantId)}`;
}

export function shouldOfferInstantWinnerGeneration(secondaryPrizeCount: number) {
  return secondaryPrizeCount > 0;
}

export type NewGameCreationAccessMode = "public" | "qr_only";

type NewGameCreationResult = {
  id: string;
  merchantId: string;
};

/**
 * Coordinates the real post-create sequence. The game is deliberately
 * created before issuing its QR capability: the secure callable validates the
 * persisted game and its owner. A QR failure is therefore recoverable and
 * must never run createGame a second time.
 */
export async function createGameThenPreparePostCreation(
  input: {
    accessMode: NewGameCreationAccessMode;
    createGame: () => Promise<NewGameCreationResult>;
    issueGameQr: (gameId: string) => Promise<unknown>;
  },
) {
  const game = await input.createGame();

  if (input.accessMode !== "qr_only") {
    return { game, qrIssueFailed: false as const };
  }

  try {
    await input.issueGameQr(game.id);
    return { game, qrIssueFailed: false as const };
  } catch {
    return { game, qrIssueFailed: true as const };
  }
}
