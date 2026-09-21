const { HttpsError } = require("firebase-functions/v2/https");
const DEFAULT_SETTINGS = Object.freeze({ connections_per_day: 350, download_url: "https://onelink.to/jx4ee7", website_url: "https://www.proxiplay.fr", sender_name: "Pascal", signature: "Proxiplay – Jouez la proximité !" });
function parseSettings(input) {
  const value = { ...DEFAULT_SETTINGS, ...input };
  const count = value.connections_per_day;
  if (count === "" || count === null) value.connections_per_day = null;
  else if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 1000000000) throw new HttpsError("invalid-argument", "Connexions par jour : nombre entier positif ou champ vide requis.");
  for (const key of ["download_url", "website_url"]) {
    try {
      const url = new URL(value[key]);
      if (typeof value[key] !== "string" || value[key].length > 2000 || url.protocol !== "https:" || url.username || url.password) throw new Error();
      value[key] = url.href;
    } catch { throw new HttpsError("invalid-argument", "Lien HTTPS valide requis."); }
  }
  for (const key of ["sender_name", "signature"]) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 500 || /[\r\n]/.test(value[key])) throw new HttpsError("invalid-argument", "Nom ou signature invalide.");
    value[key] = value[key].trim();
  }
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}
module.exports = { DEFAULT_SETTINGS, parseSettings };
