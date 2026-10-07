export type AdCampaignInput = {
  enabled: boolean;
  imageUrl: string;
  destinationUrl: string;
  startDate: string;
  endDate: string;
  frequencyCapHours: string;
  requiresFrequencyCap: boolean;
};

export function validateAdCampaign(input: AdCampaignInput): string | null {
  const imageUrl = input.imageUrl.trim();
  const destinationUrl = input.destinationUrl.trim();

  if (input.enabled && !imageUrl) {
    return "Une image est obligatoire pour activer une publicité.";
  }

  if (destinationUrl) {
    try {
      const destination = new URL(destinationUrl);
      if (destination.protocol !== "https:" && destination.protocol !== "http:") {
        return "La destination doit être une URL http(s) valide.";
      }
    } catch {
      return "La destination doit être une URL http(s) valide.";
    }
  }

  if (input.startDate && input.endDate && input.endDate <= input.startDate) {
    return "La date de fin doit être postérieure à la date de début.";
  }

  if (input.requiresFrequencyCap && input.frequencyCapHours.trim()) {
    const frequency = Number(input.frequencyCapHours);
    if (!Number.isInteger(frequency) || frequency <= 0) {
      return "La fréquence doit être un nombre d’heures positif.";
    }
  }

  return null;
}
