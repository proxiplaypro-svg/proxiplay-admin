const { HttpsError } = require("firebase-functions/v2/https");
const DEFAULT_SETTINGS = Object.freeze({ connections_per_day: 350, download_url: "https://onelink.to/jx4ee7", website_url: "https://www.proxiplay.fr", sender_name: "Pascal", signature: "Proxiplay – Jouez la proximité !", phone: "07 59 60 69 86",
  initial_email_subject: "Être visible auprès de 350 personnes par jour avec ProxiPlay ?",
  initial_email_body: "Bonjour,\n\nÊtre visible auprès d’environ 350 personnes par jour pendant un an, pour 360 € HT, ça vous dit ?\n\nC’est ce que propose ProxiPlay aux commerçants et entreprises du Dunkerquois, grâce à une application locale basée sur le jeu.\n\nVous pouvez découvrir l’application ici :\nhttps://onelink.to/jx4ee7\n\nSi le concept vous intéresse, je peux vous l’expliquer rapidement." });
function parseSettings(input) {
  const value = { ...DEFAULT_SETTINGS, ...input };
  if (typeof value.phone !== "string" || value.phone.length > 50 || /[\r\n]/.test(value.phone)) throw new HttpsError("invalid-argument", "Téléphone invalide.");
  value.phone = value.phone.trim();
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
  for (const [key, max] of [["initial_email_subject", 200], ["initial_email_body", 10000]]) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > max || (key === "initial_email_subject" && /[\r\n]/.test(value[key]))) throw new HttpsError("invalid-argument", "Modèle du premier email invalide.");
    value[key] = value[key].trim();
  }
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}
module.exports = { DEFAULT_SETTINGS, parseSettings };
