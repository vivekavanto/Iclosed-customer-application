// Human label for doc_type. Mirrors iclosed-admin/src/lib/familyDocuments.ts docTypeLabel() — keep in sync.
export function docTypeLabel(docType: string | null | undefined): string {
  const key = String(docType ?? "").toLowerCase().trim();
  if (!key) return "";
  const known: Record<string, string> = {
    aps: "Agreement of Purchase and Sale",
    aps_purchase: "Agreement of Purchase and Sale",
    aps_sale: "Agreement of Purchase and Sale",
    identification: "Identification",
    retainer_agreement: "Retainer Agreement",
    home_insurance: "Home Insurance",
    final_report: "Final Report",
    statement_of_account: "Statement of Account",
    proof_of_deposit: "Proof of Deposit",
    other: "Other Document",
  };
  if (known[key]) return known[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
