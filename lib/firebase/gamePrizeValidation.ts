export type PrizeValidationSecondary = {
  name: string;
  count: string | number;
};

function hasPositiveCount(value: string | number) {
  const count = typeof value === "number" ? value : Number.parseInt(value.trim(), 10);
  return Number.isSafeInteger(count) && count > 0;
}

export function hasValidInstantPrize(prize: PrizeValidationSecondary) {
  return prize.name.trim().length > 0 && hasPositiveCount(prize.count);
}

export function validateGamePrizes(input: {
  hasMainPrize: boolean;
  mainPrizeDescription: string;
  secondaryPrizes: PrizeValidationSecondary[];
}) {
  if (input.hasMainPrize && !input.mainPrizeDescription.trim()) {
    return "Le lot principal est obligatoire lorsque le tirage final est active.";
  }

  if (
    !input.hasMainPrize &&
    !input.secondaryPrizes.some((prize) => hasValidInstantPrize(prize))
  ) {
    return "Ajoutez au moins un lot principal ou un gain instantané.";
  }

  return null;
}
