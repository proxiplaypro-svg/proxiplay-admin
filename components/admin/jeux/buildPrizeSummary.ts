import type { Game } from "@/types/dashboard";

export type GamePrizeSummary = {
  hasMainPrize: boolean;
  mainPrizeLabel: string | null;
  mainPrizeState: "named" | "configured" | "none";
  secondaryCount: number;
  secondaryCountLabel: string | null;
  secondaryPreview: string | null;
  secondaryTooltip: string | null;
  isEmpty: boolean;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumericLike(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function truncateListPreview(items: string[], maxLength = 42) {
  const joined = items.join(", ");

  if (joined.length <= maxLength) {
    return joined;
  }

  let preview = "";

  for (const item of items) {
    const nextPreview = preview ? `${preview}, ${item}` : item;

    if (nextPreview.length > maxLength) {
      return preview ? `${preview}, ...` : `${item.slice(0, Math.max(maxLength - 3, 1))}...`;
    }

    preview = nextPreview;
  }

  return preview;
}

export function buildPrizeSummary(game: Pick<Game, "hasMainPrize" | "mainPrizeTitle" | "mainPrizeDescription" | "mainPrizeValue" | "secondaryPrizes">): GamePrizeSummary {
  const hasMainPrizeFlag = game.hasMainPrize === true;
  const mainPrizeTitle = readText(game.mainPrizeTitle);
  const mainPrizeDescription = readText(game.mainPrizeDescription);
  const mainPrizeValue = readNumericLike(game.mainPrizeValue);
  const hasUsableMainPrize = hasMainPrizeFlag && (
    mainPrizeTitle.length > 0 ||
    mainPrizeDescription.length > 0 ||
    mainPrizeValue !== null
  );

  const validSecondaryPrizes = Array.isArray(game.secondaryPrizes)
    ? game.secondaryPrizes.filter((prize) => {
        if (!prize || typeof prize !== "object") {
          return false;
        }

        const name = readText("name" in prize ? prize.name : "");
        const count = readNumericLike("count" in prize ? prize.count : null);
        return name.length > 0 || (count !== null && count > 0);
      })
    : [];

  const secondaryNames = validSecondaryPrizes
    .map((prize) => readText(prize.name))
    .filter((name) => name.length > 0);
  const secondaryCount = validSecondaryPrizes.length;

  return {
    hasMainPrize: hasUsableMainPrize,
    mainPrizeState: hasUsableMainPrize
      ? mainPrizeTitle
        ? "named"
        : "configured"
      : "none",
    mainPrizeLabel: hasUsableMainPrize
      ? mainPrizeTitle || "Lot principal configuré"
      : null,
    secondaryCount,
    secondaryCountLabel:
      secondaryCount > 0
        ? `${secondaryCount} lot secondaire${secondaryCount > 1 ? "s" : ""}`
        : null,
    secondaryPreview: secondaryNames.length > 0 ? truncateListPreview(secondaryNames) : null,
    secondaryTooltip: secondaryNames.length > 0 ? secondaryNames.join(", ") : null,
    isEmpty: !hasUsableMainPrize && secondaryCount === 0,
  };
}
