import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicGameLink, buildPosterGameLink, canonicalizeGameLink } from "./lib/admin/gameLinks";

test("public and historic URLs retain all parameters", () => {
  const query = new URLSearchParams("merchant_id=shop&animation_id=anim&x=1&x=2");
  assert.equal(buildPublicGameLink("game", query), "https://play.proxiplay.fr/j/game?merchant_id=shop&animation_id=anim&x=1&x=2");
  for (const host of ["proxiplay.fr", "www.proxiplay.fr", "play.proxiplay.fr"]) {
    const token = "a".repeat(64);
    const old = `https://${host}/j/game?qr_token=${token}&merchant_id=shop&x=1&x=2`;
    assert.equal(canonicalizeGameLink(old), `https://play.proxiplay.fr/j/game?qr_token=${token}&merchant_id=shop&x=1&x=2`);
  }
  assert.equal(canonicalizeGameLink("https://other.example/j/game?x=1"), "https://other.example/j/game?x=1");
});

test("poster rebuilds a canonical URL and retains parameters from a saved game URL", () => {
  assert.equal(buildPosterGameLink("game", "https://proxiplay.fr/j/game?x=1&x=2"), "https://play.proxiplay.fr/j/game?x=1&x=2");
  assert.equal(buildPosterGameLink("game", ""), "https://play.proxiplay.fr/j/game");
  assert.equal(buildPosterGameLink("game", "https://other.example/j/game"), "https://play.proxiplay.fr/j/game");
});
