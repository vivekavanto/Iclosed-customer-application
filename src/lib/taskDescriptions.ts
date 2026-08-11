export type TaskSide = "purchase" | "sale" | null;

interface TaskDescriptionRule {
  match: string;
  sides?: Exclude<TaskSide, null>[];
  description: string;
  // Rendered as a highlighted callout below the description.
  note?: string;
}

const RULES: TaskDescriptionRule[] = [
  {
    match: "agreement of purchase",
    sides: ["sale", "purchase"],
    description:
      "Please upload your Agreements of Purchase and Sale (APS), and any amendments/schedules so we can prepare your file accordingly.",
  },
  {
    match: "mortgage statement",
    sides: ["sale"],
    description:
      "Please upload your most recent mortgage statement, which we use to request the payout amount needed to pay off and discharge your mortgage on closing.",
  },
  {
    match: "latest property tax bill",
    sides: ["sale"],
    description:
      "Please upload your latest property tax bill and proof of payment. We use these to adjust taxes between you and the buyer. Because taxes are split by the closing date, each side pays only for the part of the year they own the home.",
    note: "If your property taxes are paid by pre-authorized withdrawal, please contact the municipality to cancel it as of the closing date. This does not happen automatically when the property is sold, and withdrawals will continue after closing unless you cancel.",
  },
  {
    match: "rental equipment information",
    sides: ["sale"],
    description:
      "Many homes have rented equipment — a hot water tank, furnace, or water softener — often under a contract or lien. If any of yours are rented, please provide the details so they can either be taken over by the buyer or bought out (paid off) before closing.",
  },
  {
    match: "mortgage representative details",
    sides: ["purchase"],
    description:
      "Please provide the contact details for your mortgage broker or lender, so we can coordinate your financing and receive your mortgage instructions.",
  },
  {
    match: "home insurance policy",
    sides: ["purchase"],
    description:
      "Before releasing your mortgage funds, your lender requires proof that your new home is insured as of the closing date, with them listed on the policy. Please upload a home insurance policy that matches the checklist below.",
  },
];

export function getTaskCopy(
  title: string | null | undefined,
  side: TaskSide = null,
): { description: string; note: string | null } | null {
  const normalized = (title ?? "").toLowerCase();
  if (!normalized) return null;

  for (const rule of RULES) {
    if (!normalized.includes(rule.match)) continue;
    if (rule.sides && (side === null || !rule.sides.includes(side))) continue;
    return { description: rule.description, note: rule.note ?? null };
  }
  return null;
}

export function dealTypeToSide(type: string | null | undefined): TaskSide {
  if (type === "Sale") return "sale";
  if (type === "Purchase") return "purchase";
  return null;
}
