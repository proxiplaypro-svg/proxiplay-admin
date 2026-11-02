const { HttpsError } = require("firebase-functions/v2/https");

// Defaults contain no traffic or price claim. Those claims are opt-in and auditable.
const DEFAULT_SETTINGS = Object.freeze({
  download_url: "https://onelink.to/jx4ee7",
  website_url: "https://www.proxiplay.fr",
  sender_name: "Pascal",
  signature: "Proxiplay – Jouez la proximité !",
  phone: "07 59 60 69 86",
  audience_metric: "",
  audience_metric_source: "",
  commercial_price_label: "",
  initial_email_subject: "Faire découvrir votre entreprise avec ProxiPlay ?",
  initial_email_body: "Bonjour,\n\nProxiPlay propose aux commerçants et entreprises du Dunkerquois de faire découvrir leur activité grâce à une application locale basée sur le jeu.\n\nVous pouvez découvrir l’application ici :\nhttps://onelink.to/jx4ee7\n\nSi le concept vous intéresse, je peux vous l’expliquer rapidement.",
  follow_up_email_subject: "Re: Découvrir votre entreprise avec ProxiPlay",
  follow_up_email_body: "Bonjour,\n\nJe me permets de revenir vers vous au sujet de ProxiPlay. Seriez-vous disponible pour un court échange afin de voir si le concept peut convenir à votre entreprise ?",
});

function parseSettings(input) {
  const value = { ...DEFAULT_SETTINGS, ...input };
  if (typeof value.phone !== "string" || value.phone.length > 50 || /[\r\n]/.test(value.phone)) throw new HttpsError("invalid-argument", "Téléphone invalide.");
  value.phone = value.phone.trim();
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
  for (const [key, max] of [["initial_email_subject", 200], ["initial_email_body", 10000], ["follow_up_email_subject", 200], ["follow_up_email_body", 10000]]) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > max || (key.endsWith("subject") && /[\r\n]/.test(value[key]))) throw new HttpsError("invalid-argument", "Modèle d’email invalide.");
    value[key] = value[key].trim();
  }
  for (const [key, max] of [["audience_metric", 500], ["commercial_price_label", 200]]) {
    if (typeof value[key] !== "string" || value[key].length > max || /[\r\n]/.test(value[key])) throw new HttpsError("invalid-argument", "Indicateur ou tarif invalide.");
    value[key] = value[key].trim();
  }
  if (typeof value.audience_metric_source !== "string" || value.audience_metric_source.length > 2000) throw new HttpsError("invalid-argument", "Source de l’indicateur invalide.");
  value.audience_metric_source = value.audience_metric_source.trim();
  if (value.audience_metric && !value.audience_metric_source) throw new HttpsError("invalid-argument", "Une source est requise pour l’indicateur d’audience.");
  if (value.audience_metric_source) {
    try { const url = new URL(value.audience_metric_source); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); value.audience_metric_source = url.href; }
    catch { throw new HttpsError("invalid-argument", "Source HTTPS valide requise."); }
  }
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}

module.exports = { DEFAULT_SETTINGS, parseSettings };
