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

export function resolveHasMainPrize(hasMainPrize: unknown, prizeValue: unknown) {
  return typeof hasMainPrize === "boolean"
    ? hasMainPrize
    : prizeValue !== undefined && prizeValue !== null;
}

export function resolveMainPrizeFields(game: {
  main_prize_title?: unknown;
  main_prize_description?: unknown;
  title?: unknown;
  name?: unknown;
  description?: unknown;
  conditions?: unknown;
}) {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  // Empty dedicated fields occur on legacy drafts. They must not mask the
  // title and description that historically carried the main-prize text.
  // A non-empty dedicated value always remains the authoritative value.
  return {
    mainPrizeTitle: text(game.main_prize_title) || text(game.title) || text(game.name),
    mainPrizeDescription:
      text(game.main_prize_description) || text(game.description) || text(game.conditions),
  };
}

export function buildMainPrizeWriteFields<T extends Record<string, unknown>>(
  hasMainPrize: boolean,
  fields: T,
) {
  return hasMainPrize ? fields : {};
}

export function buildMainPrizeRemovalFields(remove: unknown) {
  return {
    prize_value: remove,
    main_prize_title: remove,
    main_prize_description: remove,
    main_prize_image: remove,
  };
}

export function buildMainPrizeEditFields<T>(
  hasMainPrize: boolean,
  title: string,
  description: string,
  remove: T,
) {
  return hasMainPrize
    ? { main_prize_title: title.trim(), main_prize_description: description.trim() }
    : { main_prize_title: remove, main_prize_description: remove, main_prize_image: remove };
}

export function validateGamePrizes(input: {
  hasMainPrize: boolean;
  mainPrizeDescription: string;
  secondaryPrizes: PrizeValidationSecondary[];
}) {
  if (input.hasMainPrize && !input.mainPrizeDescription.trim()) {
    return "Le lot principal est obligatoire lorsque le tirage final est active.";
  }

  if (!input.hasMainPrize && !input.secondaryPrizes.some(hasValidInstantPrize)) {
    return "Ajoutez au moins un lot principal ou un gain instantané.";
  }

  return null;
}
