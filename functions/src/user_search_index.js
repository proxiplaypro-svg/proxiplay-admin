const MAX_INDEXED_VALUE_LENGTH = 64;
const MAX_NAME_VALUES = 6;
const MAX_NAME_TOKEN_LENGTH = 32;
const MAX_EMAIL_TOKENS = 5;
const MAX_EMAIL_TOKEN_LENGTH = 32;
const MAX_PHONE_DIGITS = 20;
const MAX_SEARCH_TERMS_PER_USER =
  MAX_NAME_VALUES * ((MAX_NAME_TOKEN_LENGTH * (MAX_NAME_TOKEN_LENGTH - 1)) / 2) +
  MAX_EMAIL_TOKENS * (MAX_EMAIL_TOKEN_LENGTH - 1) +
  ((MAX_PHONE_DIGITS * (MAX_PHONE_DIGITS - 1)) / 2) +
  (MAX_INDEXED_VALUE_LENGTH - 1);

function readText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function addSubstrings(terms, value, maxLength) {
  const normalized = normalizeSearchText(value).slice(0, maxLength);
  for (let start = 0; start < normalized.length; start += 1) {
    for (let end = start + 2; end <= normalized.length; end += 1) {
      terms.add(normalized.slice(start, end));
    }
  }
}

function addPrefixes(terms, value, maxLength) {
  const normalized = normalizeSearchText(value).slice(0, maxLength);
  for (let end = 2; end <= normalized.length; end += 1) terms.add(normalized.slice(0, end));
}

function buildSearchTerms({ names, email, phone, userId }) {
  const terms = new Set();
  const nameValues = [...new Set(names.map(normalizeSearchText).filter(Boolean))].slice(0, MAX_NAME_VALUES);
  for (const name of nameValues) {
    for (const token of name.split(" ")) addSubstrings(terms, token, MAX_NAME_TOKEN_LENGTH);
  }
  const emailTokens = normalizeSearchText(email).split(" ").filter(Boolean).slice(0, MAX_EMAIL_TOKENS);
  for (const token of emailTokens) addPrefixes(terms, token, MAX_EMAIL_TOKEN_LENGTH);
  addSubstrings(terms, String(phone || "").replace(/\D/g, ""), MAX_PHONE_DIGITS);
  addPrefixes(terms, userId, MAX_INDEXED_VALUE_LENGTH);
  return [...terms];
}

function buildUserSearchIndex(userId, data) {
  const displayName = readText(
    data.display_name,
    data.full_name,
    data.name,
    data.pseudo,
    [readText(data.first_name), readText(data.last_name)].filter(Boolean).join(" "),
    data.email,
    "Joueur sans nom",
  );
  const email = readText(data.email, "Email non renseigne");
  const phone = readText(data.phone_number, data.phone, data.telephone, data.mobile);
  return {
    display_name: displayName,
    email,
    phone,
    platform: readText(data.platform, data.device_platform, data.os).toLowerCase(),
    user_role: readText(data.user_role),
    search_terms: buildSearchTerms({
      names: [data.display_name, data.full_name, data.name, data.pseudo, data.first_name, data.last_name],
      email,
      phone,
      userId,
    }),
  };
}

module.exports = {
  buildUserSearchIndex,
  normalizeSearchText,
  MAX_SEARCH_TERMS_PER_USER,
};
