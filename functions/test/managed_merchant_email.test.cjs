const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { resolveOperationalMerchantEmail } = require("../src/merchant_email_policy");
const { resolvePrizeMerchantEmailPolicy } = require("../src/prize_merchant_email_policy");

const original = fs.readFileSync(path.join(__dirname, "fixtures/notify-prize-won.original.txt"), "utf8");
const patch = fs.readFileSync(path.join(__dirname, "../../docs/backend-patches/notify-prize-managed-by-admin.patch"), "utf8");
const marker = "    if (!merchantEmailDone) {";
const guard = patch.slice(patch.indexOf(`-${marker}`)).split("\ndiff --git")[0].split("\n").filter(line => line.startsWith("+")).map(line => line.slice(1)).join("\n");
assert.ok(guard.includes("resolvePrizeMerchantEmailPolicy"));
const patched = original.replace(marker, guard);

function environment(mode) {
  const documents = new Map();
  const writes = [];
  const mails = [];
  const pushes = [];
  const deleted = Symbol("delete");
  const ref = (p) => ({ path: p, id: p.split("/").at(-1), get: async () => ({ exists: documents.has(p), data: () => documents.get(p) }), set: async (data) => {
    writes.push(p);
    const next = { ...documents.get(p) };
    for (const [key, value] of Object.entries(data)) { if (value === deleted) delete next[key]; else next[key] = value; }
    documents.set(p, next);
  } });
  const db = {
    doc: ref,
    collection: name => ({
      doc: id => ref(`${name}/${id}`),
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...documents.entries()]
            .filter(([p, data]) => p.startsWith(`${name}/`) && data[field] === value)
            .map(([p, data]) => ({ id: p.split("/").at(-1), data: () => data })),
        }),
      }),
    }),
  };
  documents.set("users/player", { email: "player@example.test", first_name: "Alice" });
  documents.set("users/merchant", { email: "merchant@example.test", user_role: "commercant" });
  documents.set("enseignes/shop", { name: "Boutique", owner_id: ref("users/merchant"), email: "merchant@example.test", ...(mode === undefined ? {} : { managed_by_admin: mode }) });
  documents.set("games/game", { name: "Jeu", enseigne_id: ref("enseignes/shop"), owner_id: ref("users/merchant") });
  documents.set("prizes/prize", { name: "Lot", claim_code: "TEST", winner_id: ref("users/player"), owner_id: ref("users/merchant"), game_id: ref("games/game"), enseigne_id: ref("enseignes/shop") });
  documents.set("my_lots/lot", { prize_id: "prize", claim_code: "TEST" });
  const sandbox = {
    exports: {}, console: { log() {} }, firestore: db,
    functions: { runWith: () => ({ firestore: { document: () => ({ onCreate: handler => handler }) } }) },
    kPushNotificationRuntimeOpts: {}, kPrizeEmailEmergencyDisabled: false,
    getPrizeNotificationStatusRef: () => ref("status/prize"),
    isChannelDone: (data, sent, skipped) => data[sent] === true || data[skipped] === true,
    toDocRef: value => value || null,
    getDocData: async reference => reference ? (await reference.get()).data() : null,
    shopOwnerRef: (_db, data) => data.owner_id,
    buildUserNameParts: () => ({ firstName: "Alice", lastName: "Test" }),
    repairMojibakeText: value => value,
    buildMerchantName: () => "Commerçant",
    getTrimmedString: value => typeof value === "string" ? value.trim() : "",
    buildShopLink: () => "https://example.test/shop",
    admin: { firestore: { FieldValue: { serverTimestamp: () => "timestamp", delete: () => deleted } } },
    resolveUserEmail: async (_ref, data) => data.email,
    getUserUidFromRef: reference => reference?.id,
    logPrizeEmailAudit() {},
    validatePrizeEmailRecipient: async () => ({ ok: true }),
    validatePrizeEmailMerchantRecipient: async () => ({ ok: true }),
    createSmtpMailer: () => ({}),
    sendEmailNotification: async (_mailer, to, subject, text) => mails.push({ to, subject, text }),
    acquireMerchantEmailSendRight: async () => ({ acquired: true }),
    markMerchantEmailSent: async () => {}, markMerchantEmailFailed: async () => {},
    queuePrizePushNotification: async data => pushes.push(JSON.parse(JSON.stringify(data))),
    resolvePrizeMerchantEmailPolicy,
  };
  async function run(source = patched) {
    vm.runInNewContext(source, sandbox);
    await sandbox.exports.notifyPrizeWon({ ref: ref("prizes/prize"), data: () => documents.get("prizes/prize") }, { params: { prizeId: "prize" } });
  }
  return { db, documents, writes, mails, pushes, run };
}

for (const mode of [undefined, false, "true"]) test(`A/F : le handler conserve l’email marchand pour managed_by_admin=${mode}`, async () => {
  const env = environment(mode); await env.run();
  assert.equal(env.mails.filter(mail => mail.to === "merchant@example.test").length, 1);
});

test("B/C/D : patch du véritable handler, email marchand supprimé, joueur/push/prize/my_lots inchangés", async () => {
  const before = environment(true); await before.run(original);
  const after = environment(true);
  const prize = after.documents.get("prizes/prize"); const lot = after.documents.get("my_lots/lot");
  await after.run(); await after.run();
  assert.equal(after.mails.filter(mail => mail.to === "merchant@example.test").length, 0);
  assert.deepEqual(after.mails, before.mails.filter(mail => mail.to === "player@example.test"));
  assert.deepEqual(after.pushes, before.pushes);
  assert.equal(after.documents.get("prizes/prize"), prize); assert.equal(after.documents.get("my_lots/lot"), lot);
  assert.ok(after.writes.every(p => p === "status/prize"));
  assert.equal(after.documents.get("status/prize").merchant_email_skip_reason, "managed_by_admin");
  assert.equal(after.documents.get("status/prize").last_error, undefined);
});

test("l’enseigne du jeu prévaut sur la copie dénormalisée du prize", async () => {
  const env = environment(true);
  env.documents.set("enseignes/other", { managed_by_admin: false });
  env.documents.get("prizes/prize").enseigne_id = env.db.doc("enseignes/other");
  await env.run(); assert.equal(env.mails.filter(mail => mail.to === "merchant@example.test").length, 0);
});

test("relances : garde serveur avant SMTP, email client ignoré, anciennes requêtes protégées", async () => {
  for (const mode of [true, false, undefined]) {
    const env = environment(mode);
    const result = await resolveOperationalMerchantEmail(env.db, { merchantId: "shop", email: "arbitrary@example.test" });
    assert.equal(result.skipped, mode === true);
    if (!result.skipped) assert.equal(result.email, "merchant@example.test");
    assert.equal((await resolveOperationalMerchantEmail(env.db, { email: "merchant@example.test" })).skipped, mode === true);
  }
});
