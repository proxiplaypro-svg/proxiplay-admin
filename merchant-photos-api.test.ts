import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { MerchantPhotoService } from "./lib/admin/merchantPhotosServer";

if (![process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].every(host => host && /^(localhost|127\.0\.0\.1):\d+$/.test(host))) throw new Error("Local emulators required");
initializeApp({ projectId: "demo-admin-merchants" });
const db = getFirestore();
const blobs = new Map<string, Buffer>();
const removed: string[] = [];
const service = new MerchantPhotoService(db, { async save(path, bytes) { blobs.set(path, bytes); return `https://example.test/${path}`; }, async remove(path) { removed.push(path); blobs.delete(path); } });
test.after(() => db.terminate());
async function form(id: string, manifest: unknown[], file?: Buffer) {
  const data = new FormData(); data.set("operation", randomUUID()); data.set("version", (await service.read(id)).version); data.set("manifest", JSON.stringify(manifest));
  if (file) data.set("new", new File([new Uint8Array(file)], "new.webp", { type: "image/webp" })); return data;
}
test("gallery uses existing Flutter documents, preserves metadata, primary and legacy cover", async () => {
  await db.doc("enseignes/gallery").set({ name: "Untouched", imageUrl: "https://example.test/legacy" });
  await db.doc("enseignes/gallery/images/z").set({ url: "https://example.test/z", mobile_metadata: 42 });
  await db.doc("enseignes/gallery/images/a").set({ url: "https://example.test/a" });
  const before = await service.read("gallery"); assert.equal(before.photos[0].id, "__legacy_cover");
  const result = await service.save("gallery", await form("gallery", [{ id: "z" }, { id: "__legacy_cover" }, { id: "a" }]));
  assert.deepEqual(result.photos.map(p => p.url), ["https://example.test/z", "https://example.test/legacy", "https://example.test/a"]);
  const docs = await db.collection("enseignes/gallery/images").get(); assert.equal(docs.docs[0].get("url"), "https://example.test/z"); assert.equal(docs.docs[0].get("mobile_metadata"), 42);
  const shop = await db.doc("enseignes/gallery").get(); assert.equal(shop.get("imageUrl"), result.photos[0].url); assert.equal(shop.get("name"), "Untouched");
});
test("upload multiple, idempotent retry, reorder, remove owned blobs only", async () => {
  await db.doc("enseignes/upload").set({ logo: "https://example.test/old" });
  const bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).webp().toBuffer();
  const upload = await form("upload", [{ file: "new" }, { id: "__legacy_cover" }], bytes);
  const result = await service.save("upload", upload); const count = blobs.size;
  assert.equal(result.photos.length, 2); assert.equal(blobs.size, count);
  assert.deepEqual((await service.save("upload", upload)).photos, result.photos); assert.equal(blobs.size, count);
  assert.match(result.photos[0].url, /enseignes\/upload\/photos\/[a-f0-9-]+-0.webp$/);
  const reversed = await service.save("upload", await form("upload", result.photos.toReversed().map(p => ({ id: p.id }))));
  assert.equal(reversed.photos[0].url, "https://example.test/old");
  await service.save("upload", await form("upload", []));
  assert.equal((await db.doc("enseignes/upload").get()).get("imageUrl"), undefined);
  assert.equal((await db.doc("enseignes/upload").get()).get("logo"), undefined);
  assert.equal((await service.read("upload")).photos.length, 0); assert.equal(blobs.size, count - 1); assert.ok(removed.every(path => path.startsWith("enseignes/upload/photos/")));
});
test("concurrent changes rejected, bad manifests/paths and rollback on upload failure", async () => {
  await db.doc("enseignes/conflict").set({});
  const stale = await form("conflict", []); await db.doc("enseignes/conflict/images/new").set({ url: "https://example.test/new" });
  await assert.rejects(service.save("conflict", stale), /changé/);
  await assert.rejects(service.save("conflict", await form("conflict", [{ id: "new" }, { id: "new" }])), /double/);
  await assert.rejects(service.save("conflict", await form("conflict", Array.from({ length: 6 }, () => ({ id: "new" })))), /maximum/);
  await assert.rejects(service.read("../other"));
  const cleaned: string[] = [];
  const failing = new MerchantPhotoService(db, { async save() { throw new Error("storage down"); }, async remove(path) { cleaned.push(path); } });
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).webp().toBuffer();
  const before = await service.read("conflict");
  await assert.rejects(failing.save("conflict", await form("conflict", [{ file: "new" }], bytes)), /storage down/);
  assert.equal(cleaned.length, 1); assert.deepEqual(await service.read("conflict"), before);
});
test("routes require admin, reject oversized payloads and malformed searches", async () => {
  const photos = await import("./app/api/admin/marchands/photos/route");
  const google = await import("./app/api/admin/marchands/google/route");
  const request = (token?: string, body?: string, extra = {}) => new Request("http://localhost/api/admin/marchands/photos?merchantId=gallery", { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body ? { body } : {}) });
  assert.equal((await photos.GET(request())).status, 401); assert.equal((await google.POST(request())).status, 401);
  async function signup(admin: boolean) {
    const email = admin ? "proxiplay.pro@gmail.com" : `media-${randomUUID()}@example.test`;
    const endpoint = admin ? "signInWithPassword" : "signUp";
    let response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: admin ? "local-test-password" : "local-password", returnSecureToken: true }) });
    if (admin && !response.ok) response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "local-test-password", returnSecureToken: true }) });
    const user = await response.json(); assert.ok(user.idToken); return user.idToken;
  }
  const player = await signup(false); const admin = await signup(true);
  assert.equal((await photos.GET(request(player))).status, 403); assert.equal((await google.POST(request(player))).status, 403);
  assert.equal((await photos.GET(request(admin))).status, 200);
  assert.equal((await photos.POST(request(admin, "x", { "content-length": String(5 * 1024 * 1024) }))).status, 413);
  assert.equal((await google.POST(request(admin, "null"))).status, 400);
  assert.equal((await google.POST(request(admin, "{}"))).status, 400);
});
