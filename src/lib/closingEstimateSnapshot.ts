// Read a frozen `deal_closing_estimates.line_items` snapshot back into a
// Statement, so the same renderer draws the firm's issued figures and the
// client's live what-if numbers.
//
// The READ half only — the admin app owns writing these snapshots
// (src/lib/closingEstimate.ts there). Keep this in sync with that file's
// `snapshotToStatement`.
//
// Tolerant by design: anything missing falls back rather than throwing, because
// an issued estimate must always stay viewable. In particular a CALC_VERSION 1
// snapshot has no property-tax fields at all, which correctly reads back as
// "no adjustment".

import { CALC_VERSION, num, type Statement } from "./closingCosts";

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
  return value && typeof value === "object" ? (value as Bag) : {};
}

export function snapshotToStatement(snapshot: unknown): Statement | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = bag(snapshot);
  if (!Array.isArray(s.groups)) return null;

  const balance = bag(s.balance);
  const detail = bag(s.detail);
  const hst = bag(s.hst);

  return {
    calcVersion: num(s.calc_version, CALC_VERSION),
    groups: (s.groups as unknown[]).map((rawGroup) => {
      const g = bag(rawGroup);
      return {
        key: String(g.key ?? ""),
        title: String(g.title ?? ""),
        lines: Array.isArray(g.lines)
          ? (g.lines as unknown[]).map((rawLine) => {
              const l = bag(rawLine);
              return {
                key: String(l.key ?? ""),
                label: String(l.label ?? ""),
                amount: num(l.amount),
                ...(l.sublabel ? { sublabel: String(l.sublabel) } : {}),
                ...(l.badge ? { badge: String(l.badge) } : {}),
              };
            })
          : [],
      };
    }),
    hst: {
      label: String(hst.label ?? "HST"),
      amount: num(hst.amount),
    },
    total: num(s.total),
    propertyTax: s.property_tax
      ? (() => {
          const p = bag(s.property_tax);
          return {
            key: String(p.key ?? "property_tax_adjustment"),
            label: String(p.label ?? "Property tax adjustment"),
            amount: num(p.amount),
            ...(p.sublabel ? { sublabel: String(p.sublabel) } : {}),
          };
        })()
      : null,
    balance: {
      purchasePrice: num(balance.purchase_price),
      depositPaid: num(balance.deposit_paid),
      mortgageAmount: num(balance.mortgage_amount),
      closingCosts: num(balance.closing_costs, num(s.total)),
      propertyTaxAdjustment: num(balance.property_tax_adjustment),
      balanceDue: num(balance.balance_due),
    },
    detail: {
      provincialLTT: num(detail.provincial_ltt),
      municipalLTT: num(detail.municipal_ltt),
      ontarioRebate: num(detail.ontario_rebate),
      torontoRebate: num(detail.toronto_rebate),
      netLTT: num(detail.net_ltt),
      titlePremium: num(detail.title_premium),
      titlePremiumIsEstimate: detail.title_premium_is_estimate !== false,
      legalFees: num(detail.legal_fees),
      registrations: num(detail.registrations),
      taxableBase: num(detail.taxable_base),
      propertyTaxAdjustment: num(detail.property_tax_adjustment),
    },
  };
}
