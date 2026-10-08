// Client-facing task names from the portal redesign; DB titles stay for matching.

type Side = "purchase" | "sale" | null | undefined;

const RULES: Array<{ match: string; title: string | ((side: Side) => string) }> = [
  {
    match: "agreement of purchase",
    title: (side) => (side === "sale" ? "Upload your sale agreement" : "Upload your purchase agreement"),
  },
  { match: "mortgage statement", title: "Your mortgage" },
  { match: "mortgage representative", title: "Your mortgage" },
  { match: "personal info", title: "Your information" },
  { match: "ownership shares", title: "How you will own the home" },
  { match: "hold title", title: "How you will own the home" },
  { match: "identif", title: "Upload your ID" },
  { match: "treefort", title: "Online ID verification" },
  { match: "status certificate", title: "Status certificate" },
  { match: "signing appointment", title: "Your signing appointment" },
  { match: "solicitor information", title: "Send our details to your lender" },
  { match: "home insurance", title: "Home insurance" },
  { match: "void cheque", title: (side) => (side === "sale" ? "Your sale proceeds" : "Void cheque") },
  { match: "property tax", title: "Property taxes" },
  { match: "rental equipment", title: "Rental equipment" },
  { match: "lockbox", title: "Keys, lockbox and garage" },
  { match: "deposit funds into our trust account", title: "Closing funds" },
];

export function taskDisplayTitle(title: string | null | undefined, side: Side): string {
  const raw = (title ?? "").trim();
  const t = raw.toLowerCase();
  const rule = RULES.find((r) => t.includes(r.match));
  if (!rule) return raw;
  return typeof rule.title === "function" ? rule.title(side) : rule.title;
}
