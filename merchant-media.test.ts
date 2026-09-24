import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { GooglePlacesProvider } from "./lib/prospection/provider";
import { googleMerchantPatch } from "./lib/admin/merchantGoogle";
import { checkedPhoto } from "./lib/admin/merchantPhotosServer";
import { validatePhotoFile, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES } from "./lib/admin/merchantPhotos";

test("Google: one name/location request, five results, complete fields, no photos/details/pagination", async () => {
  const calls: RequestInit[] = [];
  const provider = new GooglePlacesProvider("test-key", async (_url, options) => {
    calls.push(options!);
    return Response.json({ nextPageToken: "unused", places: Array.from({ length: 6 }, (_, index) => ({ id: `place-${index}`, displayName: { text: "USDK" }, formattedAddress: "28 rue du Stade", addressComponents: [{ longText: "Dunkerque", types: ["locality"] }, { longText: "59140", types: ["postal_code"] }], nationalPhoneNumber: "0328000000", websiteUri: "https://example.test", rating: 4.5, userRatingCount: 42 })) });
  });
  const results = await provider.findBusiness(" USDK ", " Dunkerque ");
  assert.equal(calls.length, 1); assert.equal(results.length, 5);
  assert.deepEqual(JSON.parse(calls[0].body as string), { textQuery: "USDK Dunkerque", languageCode: "fr", pageSize: 5 });
  assert.doesNotMatch(JSON.stringify(calls[0].headers), /photos|nextPageToken/);
  const { patch, preserved } = googleMerchantPatch({ address: "Adresse manuelle", city: "", phone: "0600000000" }, results[0]);
  assert.deepEqual(preserved, ["address", "phone"]);
  assert.deepEqual(patch, { google_place_id: "place-0", area_code: "59140", city: "Dunkerque", site_web_url: "https://example.test/" });
  assert.equal(results[0].google_rating, 4.5); assert.equal(results[0].google_user_rating_count, 42);
});
test("Google: empty, unavailable, invalid input and missing key", async () => {
  assert.deepEqual(await new GooglePlacesProvider("x", async () => Response.json({})).findBusiness("USDK", "Dunkerque"), []);
  await assert.rejects(new GooglePlacesProvider("x", async () => new Response("", { status: 503 })).findBusiness("USDK", "Dunkerque"));
  await assert.rejects(new GooglePlacesProvider("x", async () => { throw new Error("timeout"); }).findBusiness("USDK", "Dunkerque"));
  await assert.rejects(new GooglePlacesProvider("").findBusiness("USDK", "Dunkerque"));
  await assert.rejects(new GooglePlacesProvider("x").findBusiness("", "Dunkerque"));
});
for (const format of ["jpeg", "png", "webp"] as const) test(`Photos: ${format}, size, orientation and metadata stripped`, async () => {
  const source = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "red" } }).toFormat(format).withMetadata({ orientation: 6 }).toBuffer();
  validatePhotoFile({ type: `image/${format}`, size: source.length });
  const optimized = await checkedPhoto(source, `image/${format}`);
  const meta = await sharp(optimized).metadata();
  assert.equal(meta.format, "webp"); assert.equal(meta.width, 800); assert.equal(meta.height, 1600); assert.equal(meta.exif, undefined);
});
test("Photos: reject fake MIME, invalid bytes, oversize, unsupported formats", async () => {
  assert.throws(() => validatePhotoFile({ type: "image/svg+xml", size: 10 }));
  assert.throws(() => validatePhotoFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 }));
  await assert.rejects(checkedPhoto(Buffer.from("invalid"), "image/jpeg"));
  await assert.rejects(checkedPhoto(Buffer.alloc(MAX_UPLOAD_BYTES + 1), "image/jpeg"));
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(checkedPhoto(png, "image/jpeg"));
});
