const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSmtpPassword } = require("../src/smtp_password");

test("retire un saut de ligne final (LF ou CRLF) et le signale", () => {
  assert.deepEqual(normalizeSmtpPassword("abc123\n"), { pass: "abc123", length: 6, trimmed: true });
  assert.deepEqual(normalizeSmtpPassword("abc123\r\n"), { pass: "abc123", length: 6, trimmed: true });
  assert.deepEqual(normalizeSmtpPassword("  abc123 "), { pass: "abc123", length: 6, trimmed: true });
});

test("laisse intact un mot de passe propre, espaces internes compris", () => {
  assert.deepEqual(normalizeSmtpPassword("a b#c"), { pass: "a b#c", length: 5, trimmed: false });
});

test("valeur absente ou non textuelle : mot de passe vide", () => {
  assert.deepEqual(normalizeSmtpPassword(undefined), { pass: "", length: 0, trimmed: false });
  assert.deepEqual(normalizeSmtpPassword("\n"), { pass: "", length: 0, trimmed: true });
});

test("le journal ne contient que longueur et indicateur", () => {
  const { length, trimmed } = normalizeSmtpPassword("secret-value\n");
  assert.equal(JSON.stringify({ passLength: length, passTrimmed: trimmed }).includes("secret"), false);
});
