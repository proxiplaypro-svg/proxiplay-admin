// Mot de passe SMTP lu depuis Secret Manager : un saut de ligne ou un espace final
// (secret créé par copier-coller ou `echo`) fait échouer l'authentification OVH.
// Ne renvoie jamais la valeur dans un journal : seulement sa longueur et le nettoyage.
function normalizeSmtpPassword(raw) {
  const value = typeof raw === "string" ? raw : "";
  const pass = value.trim();
  return { pass, length: pass.length, trimmed: pass.length !== value.length };
}

module.exports = { normalizeSmtpPassword };
