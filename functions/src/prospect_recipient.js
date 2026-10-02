const { validEmail } = require("./prospect_crawler");
function prospectRecipient(prospect) {
  const candidates = [prospect?.contact_email, prospect?.email, ...(prospect?.emails || []).filter(item => item.is_primary).map(item => item.email), ...(prospect?.emails || []).map(item => item.email)];
  const recipient = candidates.find(candidate => validEmail(typeof candidate === "string" ? candidate.trim() : candidate));
  return recipient ? recipient.trim().toLowerCase() : "";
}
module.exports = { prospectRecipient };
