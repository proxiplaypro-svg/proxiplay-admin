export function canonicalizeGameLink(link: string): string {
  try {
    const url = new URL(link);
    if (url.protocol === "https:" && ["proxiplay.fr", "www.proxiplay.fr", "play.proxiplay.fr"].includes(url.hostname) && url.pathname.startsWith("/j/")) {
      url.hostname = "play.proxiplay.fr";
      return url.toString();
    }
  } catch { /* Leave unrelated or invalid links untouched. */ }
  return link;
}

export function buildPublicGameLink(gameId: string, params = new URLSearchParams()): string {
  const query = params.toString();
  return `https://play.proxiplay.fr/j/${encodeURIComponent(gameId)}${query ? `?${query}` : ""}`;
}

export function buildPosterGameLink(gameId: string, savedLink: string): string {
  try {
    const url = new URL(savedLink);
    if (url.protocol === "https:" && ["proxiplay.fr", "www.proxiplay.fr", "play.proxiplay.fr"].includes(url.hostname) && url.pathname === `/j/${encodeURIComponent(gameId)}`) {
      return buildPublicGameLink(gameId, url.searchParams);
    }
  } catch { /* A missing or invalid saved link is rebuilt from the game id. */ }
  return buildPublicGameLink(gameId);
}
