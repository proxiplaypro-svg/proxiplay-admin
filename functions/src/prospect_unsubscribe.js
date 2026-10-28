const { randomBytes, createHash } = require("node:crypto");

// One random token per prospect, reused for every email. Only its hash is a document id,
// so a database read never yields a working link and the URL cannot be guessed from an id.
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const newUnsubscribeToken = () => randomBytes(32).toString("base64url");
const tokenRef = (db, token) => db.doc(`prospection_internal/unsubscribe/tokens/${createHash("sha256").update(token).digest("hex")}`);
const unsubscribeLink = (base, token) => `${base}?t=${token}`;
const withUnsubscribeFooter = (body, url) => `${body}\n\n—\nVous ne souhaitez plus recevoir nos emails ? Désinscription : ${url}`;
const defaultUnsubscribeBase = () => `https://europe-west1-${process.env.GCLOUD_PROJECT || "proxi-play-odzp2e"}.cloudfunctions.net/prospectUnsubscribe`;

function page(res, status, title, content) {
  res.status(status).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#1a1a1a;line-height:1.6"><h1 style="font-size:22px">${title}</h1>${content}</body></html>`);
}

// GET only shows a confirmation: link scanners and previews must not unsubscribe anyone.
// POST records the opposition (form button or RFC 8058 one-click from the mail client).
function createUnsubscribeHandler({ db, clock = Date.now }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").set("X-Robots-Tag", "noindex")
      .set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    if (!["GET", "POST"].includes(req.method)) return page(res, 405, "Méthode non autorisée", "");
    const token = String(req.query?.t || req.body?.t || "");
    const invalid = () => page(res, 404, "Lien invalide", "<p>Ce lien de désinscription est invalide ou incomplet.</p>");
    if (!TOKEN.test(token)) return invalid();
    if (req.method === "GET") return page(res, 200, "Désinscription", `<p>Confirmez que vous ne souhaitez plus recevoir d’emails de ProxiPlay.</p><form method="post"><input type="hidden" name="t" value="${token}"><button style="padding:10px 16px;font:inherit;cursor:pointer">Me désinscrire</button></form>`);
    const mapping = (await tokenRef(db, token).get()).data();
    if (!mapping?.prospect_id) return invalid();
    const ref = db.doc(`prospects/${mapping.prospect_id}`);
    await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || data.deleting || data.unsubscribed_at) return;
      const at = new Date(clock()).toISOString();
      tx.update(ref, { do_not_contact: true, unsubscribed_at: at, revision: (data.revision || 0) + 1, updated_at: at });
      tx.create(ref.collection("history").doc(), { action: "unsubscribed", actor: "prospect", at, detail: "Désinscription via le lien de l’email" });
    });
    return page(res, 200, "Vous êtes désinscrit", "<p>Votre demande est enregistrée. Vous ne recevrez plus d’emails de prospection de ProxiPlay.</p>");
  };
}

module.exports = { newUnsubscribeToken, tokenRef, unsubscribeLink, withUnsubscribeFooter, defaultUnsubscribeBase, createUnsubscribeHandler };
