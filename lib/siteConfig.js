// The legal details shown on the Privacy Policy and Terms pages. Fill these
// in ONCE here — the legal pages read from this file, so there's nothing to
// hunt for. While any value still contains "[", the legal pages show a
// visible "Draft" banner instead of silently publishing a placeholder.
export const SITE = {
  name: "Evoke",
  url: "https://evoke.booostglobal.com", // this app's public address
  companyUrl: "https://booostglobal.com", // the Booost company site ("By Booost" links here)
  operator: "Booost Multiservices Limited", // VERIFY: must match the CAC certificate exactly
  contactEmail: "[contact email]", // a monitored address for privacy and support requests
  lastUpdated: "5 October 2026", // update whenever the policy or terms change
};

export function legalDetailsMissing() {
  return [SITE.operator, SITE.contactEmail].some((v) => v.includes("["));
}
