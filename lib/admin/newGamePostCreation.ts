export function getNewGamePostCreationRoute(merchantId: string) {
  return `/admin/games?merchantId=${encodeURIComponent(merchantId)}`;
}

export function shouldOfferInstantWinnerGeneration(secondaryPrizeCount: number) {
  return secondaryPrizeCount > 0;
}
