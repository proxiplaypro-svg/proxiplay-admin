import type { Prospect } from "./model";

export const isValidProspectEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value.trim());
export function prospectRecipient(p: Pick<Prospect, "contact_email" | "email" | "emails">): string {
  const candidates = [p.contact_email, p.email, ...(p.emails || []).filter(item => item.is_primary).map(item => item.email), ...(p.emails || []).map(item => item.email)];
  return candidates.find(isValidProspectEmail)?.trim().toLowerCase() || "";
}
export function isCampaignEmailEligible(p: Pick<Prospect, "contact_email" | "email" | "emails" | "do_not_contact" | "email_sending_id" | "proposal">) {
  const recipient = prospectRecipient(p);
  return Boolean(recipient)
    && !p.do_not_contact
    && !p.email_sending_id
    && (!p.proposal || (p.proposal.status === "draft" && p.proposal.to.trim().toLowerCase() === recipient));
}
