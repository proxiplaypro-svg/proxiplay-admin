export function resolveCreateGameDescriptions(input: {
  accessMode: "public" | "qr_only";
  gameDescription?: string;
  mainPrizeDescription: string;
}) {
  const mainPrizeDescription = input.mainPrizeDescription.trim();

  return {
    // Public games retain their historical document shape. QR games use the
    // canonical game `description` field for the event/game presentation.
    gameDescription:
      input.accessMode === "qr_only"
        ? input.gameDescription?.trim() ?? ""
        : mainPrizeDescription,
    mainPrizeDescription,
  };
}
