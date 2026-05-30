const DEFAULT_ADMIN_EMAILS = ["proxiplay.pro@gmail.com"];

export function getConfiguredAdminEmails() {
  const rawValue =
    typeof process !== "undefined" && typeof process.env.ADMIN_EMAILS === "string"
      ? process.env.ADMIN_EMAILS
      : "";

  const configuredEmails = rawValue
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configuredEmails.length > 0 ? configuredEmails : DEFAULT_ADMIN_EMAILS;
}

export function isAllowedAdminEmail(
  email: string | null | undefined,
  adminEmails = getConfiguredAdminEmails(),
) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  return adminEmails.includes(normalizedEmail);
}
