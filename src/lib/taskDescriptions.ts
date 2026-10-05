export type TaskSide = "purchase" | "sale" | null;

interface TaskDescriptionRule {
  match: string;
  sides?: Exclude<TaskSide, null>[];
  description: string;
  // Rendered as a highlighted callout below the description.
  note?: string;
  details?: TaskDetailsCard;
  // Published post on /blog, shown as "Read our blog: …".
  blog?: TaskBlogLink;
}

export interface TaskBlogLink {
  title: string;
  slug: string;
}

export interface TaskDetailsCard {
  heading: string;
  lines: string[];
}

const RULES: TaskDescriptionRule[] = [
  {
    match: "agreement of purchase",
    sides: ["sale", "purchase"],
    description:
      "Please upload your Agreement of Purchase and Sale (APS), and any amendments/schedules so we can prepare your file accordingly.",
  },
  {
    match: "ownership shares",
    description:
      "Tell us how you would like to hold title. If you are not sure, read the explainer below or ask our team.",
  },
  {
    match: "mortgage statement",
    sides: ["sale"],
    description:
      "Please upload your most recent mortgage statement, which we use to request the payout amount needed to pay off and discharge your mortgage on closing.",
    blog: {
      title: "Mortgage statements and payout statements",
      slug: "mortgage-statements-and-payout-statements-what-sellers-need-to-know",
    },
  },
  {
    match: "latest property tax bill",
    sides: ["sale"],
    description:
      "Please upload your latest property tax bill. We use it to split this year's taxes between you and the buyer.",
    note: "Paying by pre-authorized withdrawal? Contact the municipality to cancel it as of the closing date.",
    blog: {
      title: "How property taxes are adjusted on closing",
      slug: "how-property-tax-is-adjusted-when-you-sell-your-ontario-home",
    },
  },
  {
    match: "rental equipment information",
    sides: ["sale"],
    description:
      "Many homes have rental equipment e.g. hot water tank, furnace, water softener. If your property has rental equipment, please provide the details below.",
    blog: {
      title: "What happens to rental equipment when you sell",
      slug: "what-happens-to-rental-equipment-when-you-sell-your-home",
    },
  },
  {
    match: "mortgage representative details",
    sides: ["purchase"],
    description:
      "Please provide the contact details for your mortgage broker or lender, so we can coordinate your financing and receive your mortgage instructions.",
  },
  {
    match: "treefort id verification",
    sides: ["purchase", "sale"],
    description:
      "Please complete ID verification by Treefort prior to your signing appointment. The link will be sent to you via email a few days prior to signing. You'll need two pieces of ID, one with a photograph.",
    note: "If you have not received the Treefort link within a day of your signing, please reach out.",
  },
  {
    match: "solicitor information",
    sides: ["purchase"],
    description:
      "Please share the following details with your mortgage agent/lender for us to receive the mortgage instructions:",
    details: {
      heading: "Solicitor information",
      lines: [
        "Kubeskaran Navaratnam",
        "Nava Wilson Professional Corporation",
        "info@navawilson.law",
        "210-10 Milner Business Court, Toronto, ON M1B 3C6",
        "Phone: 416-321-1100 Ext. 115 | Fax: 416-321-1107",
      ],
    },
  },
  {
    match: "home insurance policy",
    sides: ["purchase"],
    description:
      "Before releasing your mortgage funds, your lender requires proof that your new home is insured as of the closing date, with them listed on the policy.",
  },
  {
    match: "void cheque",
    sides: ["sale"],
    description:
      "After your mortgage and closing costs are paid, the rest of the money from your sale is yours. Tell us how you'd like to receive it.",
  },
  {
    match: "void cheque",
    sides: ["purchase"],
    description:
      "We use your void cheque to return any excess funds after closing.",
    blog: { title: "What is a void cheque", slug: "void-cheques-why-your-lawyer-or-lender-may-ask-for-one" },
  },
  {
    // The drawer renders DEPOSIT_TASK_DESCRIPTION itself (it needs the copy
    // alongside the balance and the transfer instructions); this rule is what
    // puts the same sentence on the task CARD in the dashboard list, so the
    // client knows what the task is before opening it. Kept identical on
    // purpose — see src/lib/depositTask.ts.
    match: "deposit funds into our trust account",
    sides: ["purchase"],
    description:
      "Your closing funds must be in our trust account before we can complete your transaction. Please send us the balance due on closing using any of the three options below, then upload your proof of deposit here.",
  },
];

export function getTaskCopy(
  title: string | null | undefined,
  side: TaskSide = null,
): {
  description: string;
  note: string | null;
  details: TaskDetailsCard | null;
  blog: TaskBlogLink | null;
} | null {
  const normalized = (title ?? "").toLowerCase();
  if (!normalized) return null;

  for (const rule of RULES) {
    if (!normalized.includes(rule.match)) continue;
    if (rule.sides && (side === null || !rule.sides.includes(side))) continue;
    return {
      description: rule.description,
      note: rule.note ?? null,
      details: rule.details ?? null,
      blog: rule.blog ?? null,
    };
  }
  return null;
}

export function dealTypeToSide(type: string | null | undefined): TaskSide {
  if (type === "Sale") return "sale";
  if (type === "Purchase") return "purchase";
  return null;
}
