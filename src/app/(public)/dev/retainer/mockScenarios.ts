export type DevScenarioId =
  | "primary-solo"
  | "primary-co-purchaser"
  | "co-purchaser"
  | "purchase-sale"
  | "primary-ps-both-co"
  | "primary-co-inline"
  | "co-purchaser-inline";

export interface DevScenario {
  id: DevScenarioId;
  label: string;
  description: string;
  fullName: string;
  primaryFirstName?: string;
  propertyAddress?: string;
  purchaseAddress?: string | null;
  saleAddress?: string | null;
  leadType: string;
  side: "purchase" | "sale" | null;
  retainerCurrent: number;
  retainerTotal: number;
  isCoPerson: boolean;
  hasCoPersons: boolean;
  hasCoPurchaser: boolean;
  hasCoSeller: boolean;
  /** Inline checkbox on the retainer form instead of post-sign modal flow. */
  useInlinePermission?: boolean;
}

export const DEV_SCENARIOS: DevScenario[] = [
  {
    id: "primary-solo",
    label: "Primary — solo",
    description: "Single purchaser, no co-persons. Signs and goes straight to success.",
    fullName: "Alex Morgan",
    propertyAddress: "42 Maple Street, Toronto, ON, M5V 1A1",
    leadType: "Purchase",
    side: "purchase",
    retainerCurrent: 1,
    retainerTotal: 1,
    isCoPerson: false,
    hasCoPersons: false,
    hasCoPurchaser: false,
    hasCoSeller: false,
  },
  {
    id: "primary-co-purchaser",
    label: "Primary — with co-purchaser",
    description: "Primary purchaser with a co-purchaser. Shows permission flow after signing.",
    fullName: "Jordan Lee",
    propertyAddress: "18 Oak Avenue, Hamilton, ON, L8P 4R2",
    leadType: "Purchase",
    side: "purchase",
    retainerCurrent: 1,
    retainerTotal: 1,
    isCoPerson: false,
    hasCoPersons: true,
    hasCoPurchaser: true,
    hasCoSeller: false,
  },
  {
    id: "co-purchaser",
    label: "Co-purchaser",
    description: "Co-person signing their retainer. Permission flow from co-person perspective.",
    fullName: "Sam Patel",
    primaryFirstName: "Jordan",
    propertyAddress: "18 Oak Avenue, Hamilton, ON, L8P 4R2",
    leadType: "Purchase",
    side: "purchase",
    retainerCurrent: 2,
    retainerTotal: 2,
    isCoPerson: true,
    hasCoPersons: false,
    hasCoPurchaser: false,
    hasCoSeller: false,
  },
  {
    id: "purchase-sale",
    label: "Purchase & Sale — combined",
    description: "Primary on a P&S deal. Both property addresses shown.",
    fullName: "Taylor Chen",
    purchaseAddress: "100 King Street W, Toronto, ON, M5X 1A9",
    saleAddress: "55 Birch Road, Mississauga, ON, L5B 2C9",
    leadType: "Purchase & Sale",
    side: null,
    retainerCurrent: 1,
    retainerTotal: 1,
    isCoPerson: false,
    hasCoPersons: false,
    hasCoPurchaser: false,
    hasCoSeller: false,
  },
  {
    id: "primary-ps-both-co",
    label: "P&S — co-purchaser & co-seller",
    description: "Primary on P&S with both co-person types. Permission flow after signing.",
    fullName: "Morgan Wright",
    purchaseAddress: "100 King Street W, Toronto, ON, M5X 1A9",
    saleAddress: "55 Birch Road, Mississauga, ON, L5B 2C9",
    leadType: "Purchase & Sale",
    side: null,
    retainerCurrent: 1,
    retainerTotal: 1,
    isCoPerson: false,
    hasCoPersons: true,
    hasCoPurchaser: true,
    hasCoSeller: true,
  },
  {
    id: "primary-co-inline",
    label: "Primary — inline checkbox",
    description:
      "Checkbox on the retainer form, then step 2 prompts password setup before dashboard.",
    fullName: "Jordan Lee",
    propertyAddress: "18 Oak Avenue, Hamilton, ON, L8P 4R2",
    leadType: "Purchase",
    side: "purchase",
    retainerCurrent: 1,
    retainerTotal: 1,
    isCoPerson: false,
    hasCoPersons: true,
    hasCoPurchaser: true,
    hasCoSeller: false,
    useInlinePermission: true,
  },
  {
    id: "co-purchaser-inline",
    label: "Co-purchaser — inline checkbox",
    description:
      "Checkbox on the retainer form, then step 2 prompts password setup before dashboard.",
    fullName: "Sam Patel",
    primaryFirstName: "Jordan",
    propertyAddress: "18 Oak Avenue, Hamilton, ON, L8P 4R2",
    leadType: "Purchase",
    side: "purchase",
    retainerCurrent: 2,
    retainerTotal: 2,
    isCoPerson: true,
    hasCoPersons: false,
    hasCoPurchaser: false,
    hasCoSeller: false,
    useInlinePermission: true,
  },
];

export function getScenario(id: string | null): DevScenario {
  return (
    DEV_SCENARIOS.find((s) => s.id === id) ?? DEV_SCENARIOS[0]
  );
}
