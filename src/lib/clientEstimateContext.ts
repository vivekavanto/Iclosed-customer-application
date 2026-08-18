// The server's authoritative view of ONE client's closing-cost estimate.
//
// Every closing-cost route in the portal resolves its inputs through here, so
// there is exactly one place that decides what a client's figures ARE — and it
// is a place the browser cannot reach into.
//
// ── Why this exists ─────────────────────────────────────────────────────
// The client calculator is a locked surface: the buyer supplies their mortgage
// amount and whether they are a first-time buyer, and NOTHING else. The price,
// the deposit, the property, the purchasers, the firm whose letterhead the PDF
// carries and the fee schedule behind it all come from their file.
//
// Hiding those fields in the UI is not enforcement. Until this module existed
// the routes read them straight from the request body, so a client could POST
// any price, any purchaser name, any firm and any fee they liked and get it
// back on the firm's letterhead. `rejectLockedInputs` closes that: a locked
// field in the body is a 400, not a value.
//
// ── Ownership ───────────────────────────────────────────────────────────
// `getAuthClientDeals()` selects deals by `client_id` off the session, so the
// set of files a caller can reach is decided server-side before any id is
// looked at.
//
// A caller MAY name which of their own files to work on (`fileId`) — a client
// with a purchase and a sale needs to say which one they are planning around.
// That id is checked against the session's own deals and a miss is a 404, never
// a quiet fall-back to a different file: handing someone another file's figures
// because their own id did not match would be worse than an error.

import supabaseAdmin from "./supabaseAdmin";
import { getAuthClientDeals } from "./getAuthClient";
import { num, ratesFromConfigRow, type ClosingCostRates } from "./closingCosts";
import { isTorontoAddress } from "./isTorontoAddress";
import { readFirmAndSharedRow, readStatementTypeOption } from "./closingCostRates";
import {
  buildConfigSnapshot,
  configFromSnapshot,
  configVersionOf,
} from "./closingCostConfigSnapshot";
import type { StatementTypeConfig } from "./closingCostSettings";

// The lock rule itself is pure, so it lives in its own module and is unit
// tested there. Re-exported here so a route imports one thing.
export {
  CLIENT_EDITABLE_KEYS,
  CLIENT_SELECTOR_KEYS,
  LOCKED_INPUT_KEYS,
  MAX_AMOUNT,
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
} from "./clientEstimateLock";

/** The file-derived half of an estimate — everything the client cannot set. */
export interface LockedEstimateInputs {
  price: number;
  deposit: number;
  isToronto: boolean;
  /** The firm's exact FCT quote once it has one; null = use the approximation. */
  titlePremiumOverride: number | null;
  /**
   * The firm's planning figure for the Statement of Adjustments — the issued
   * estimate's own, or the firm's default from Settings. Read-only to a client:
   * the real figure is settled at closing, not chosen by the buyer.
   */
  propertyTaxAdjustment: number | null;
  fileNo: string | null;
  purchasers: string | null;
  propertyAddress: string | null;
  closingDate: string | null;
}

/** One of the client's files, for the picker when they have more than one. */
export interface ClientFileOption {
  id: string;
  file_number: string | null;
  property_address: string | null;
  closing_date: string | null;
  /** True when the firm has issued a statement on this file. */
  has_issued_estimate: boolean;
}

export interface ClientEstimateContext {
  /** Every file this client owns, so the modal can offer a choice. */
  files: ClientFileOption[];
  client: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
  };
  deal: {
    id: string;
    file_number: string | null;
    property_address: string | null;
    closing_date: string | null;
    price: number | null;
    /** Deposit already paid, from intake. NULL when nobody has given one. */
    deposit_amount: number | null;
  } | null;
  /** The firm's latest ISSUED estimate on this file. Drafts are staff-only. */
  issued: Record<string, unknown> | null;
  /** The fee schedule to calculate with. */
  rates: ClosingCostRates;
  /** True when `rates` came from an issued estimate's frozen snapshot. */
  ratesFromIssuedEstimate: boolean;
  /** The file's firm — fixed server-side; a client never chooses one. */
  firmKey: string | null;
  /** The firm row merged with the shared statutory row: letterhead + rates. */
  config: Record<string, unknown>;
  /** Always the DRAFT copy — a Final account is an admin-only document. */
  statementType: StatementTypeConfig;
  /**
   * The stamp for a PDF the CLIENT generates now, from today's configuration.
   *
   * Not the issued estimate's stamp: that one is frozen on the row and belongs
   * to the firm's document. Sharing the format lets the two be compared.
   */
  configVersion: string;
  /**
   * The firm's name as it was FROZEN onto the issued estimate, so the client's
   * copy of the statement is titled the way the document itself is — even if
   * the firm has been renamed since.
   */
  issuedFirmLabel: string | null;
  locked: LockedEstimateInputs;
  /** Prefilled from the file; the client may change it. */
  isFirstTimeBuyer: boolean;
  /** Prefilled from the issued estimate; the client may change it. */
  mortgage: number;
  /** Where "email it to me" goes. Not negotiable by the caller. */
  emailTo: string | null;
}

/**
 * The result of resolving a context, carrying the HTTP answer for a failure.
 *
 * A discriminated union rather than `null` because the two failures need
 * different answers: "you are not signed in" is a 401, "that is not your file"
 * is a 404, and collapsing them would tell a client to log in again over a
 * mistyped id.
 */
export type ClientEstimateContextResult =
  | { ok: true; context: ClientEstimateContext }
  | { ok: false; status: 401 | 404; error: string };

/**
 * A client's estimate context for one of their files.
 *
 * `fileId` selects among the client's own deals; omit it to take the default —
 * the file the firm has most recently issued a statement on, otherwise their
 * newest. An id that is not theirs is a 404, never a fall-back.
 *
 * A client with no file yet still gets a context — the calculator is allowed to
 * render, it simply has nothing to prefill and nowhere to save.
 */
export async function resolveClientEstimateContext(
  fileId?: string | null,
): Promise<ClientEstimateContextResult> {
  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const client = auth.client;
  const deals = auth.deals ?? [];
  const dealIds = deals.map((d) => d.id);

  // ── Every issued estimate the client has ──
  //
  // Read across all their files at once: it both picks the default file and
  // tells the picker which files carry a statement, in one round trip.
  //
  // `status = 'issued'` is the load-bearing filter: a draft is a staff working
  // copy the client must never see, let alone calculate from.
  let issuedRows: Record<string, unknown>[] = [];
  if (dealIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("deal_closing_estimates")
      .select("*")
      .in("deal_id", dealIds)
      .eq("status", "issued")
      .eq("is_deleted", false)
      .order("issued_at", { ascending: false });
    issuedRows = (data ?? []) as Record<string, unknown>[];
  }

  const dealIdsWithEstimate = new Set(
    issuedRows.map((row) => String(row.deal_id)),
  );

  const files: ClientFileOption[] = deals.map((d) => ({
    id: d.id,
    file_number: d.file_number ?? null,
    property_address: d.property_address ?? null,
    closing_date: d.closing_date ?? null,
    has_issued_estimate: dealIdsWithEstimate.has(d.id),
  }));

  // ── Which file ──
  //
  // A named file is checked against the client's OWN deals. Not found means not
  // theirs (or not a file at all), and either way the answer is 404 — never a
  // silent switch to a different file's figures.
  let deal: (typeof deals)[number] | null;
  if (fileId) {
    deal = deals.find((d) => d.id === fileId) ?? null;
    if (!deal) {
      return {
        ok: false,
        status: 404,
        error: "That file could not be found on your account.",
      };
    }
  } else {
    // Default to the file the firm has most recently issued on — that is the
    // one the client is being asked to act on. Otherwise their newest file.
    const latestIssuedDealId = issuedRows[0]
      ? String(issuedRows[0].deal_id)
      : null;
    deal =
      (latestIssuedDealId
        ? deals.find((d) => d.id === latestIssuedDealId)
        : undefined) ??
      deals[0] ??
      null;
  }

  // The estimate for THIS file — not merely the client's most recent one. With
  // more than one file those are different rows, and pairing a statement with
  // the wrong file is the bug this whole resolution exists to prevent.
  const issued = deal
    ? (issuedRows.find((row) => String(row.deal_id) === deal!.id) ?? null)
    : null;

  // ── The firm ──
  // Whoever issued the estimate; otherwise the configured default. Never the
  // caller's choice.
  const { row: config, firmKey } = await readFirmAndSharedRow(
    (issued?.firm_key as string | null) ?? null,
  );

  // ── The fee schedule ──
  // While an estimate stands, its FROZEN snapshot wins: a fee the firm raised
  // last week must not silently reprice what the client was actually quoted.
  const frozen = issued?.rates_used;
  const hasFrozen =
    !!frozen && typeof frozen === "object" && Object.keys(frozen).length > 0;
  const rates = ratesFromConfigRow(
    hasFrozen ? (frozen as Record<string, unknown>) : config,
  );

  // A client's copy is always a planning estimate, so the wording is always the
  // draft flavour — there is no path here that produces a Final account.
  const statementType = await readStatementTypeOption("draft");

  // The issued statement's own frozen presentation, when it carries one. Rows
  // written before the snapshot column existed simply fall back to the live
  // firm label, which is what they have always displayed.
  const issuedConfig = configFromSnapshot(issued?.config_snapshot);
  const issuedFirmLabel =
    (issuedConfig?.config.label as string | null) ??
    (config.label as string | null) ??
    null;

  const fullName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();

  const optional = (raw: unknown): number | null =>
    raw === null || raw === undefined || raw === "" ? null : num(raw);

  const propertyTaxAdjustment =
    issued?.property_tax_adjustment !== null &&
    issued?.property_tax_adjustment !== undefined
      ? optional(issued.property_tax_adjustment)
      : optional(config.property_tax_default);

  const context: ClientEstimateContext = {
    files,
    client: {
      id: client.id,
      email: client.email ?? null,
      firstName: client.first_name ?? null,
      lastName: client.last_name ?? null,
      fullName,
    },
    deal: deal
      ? {
          id: deal.id,
          file_number: deal.file_number ?? null,
          property_address: deal.property_address ?? null,
          closing_date: deal.closing_date ?? null,
          price: deal.price ?? null,
          deposit_amount: deal.deposit_amount ?? null,
        }
      : null,
    issued,
    rates,
    ratesFromIssuedEstimate: hasFrozen,
    firmKey,
    config,
    statementType,
    configVersion: configVersionOf(
      rates,
      buildConfigSnapshot(config, statementType),
    ),
    issuedFirmLabel,
    locked: {
      price: num(issued?.purchase_price ?? deal?.price ?? 0),
      // Staff's issued figure wins; otherwise the deposit the client gave at
      // intake, which the file carries, so they aren't asked for it twice.
      deposit: num(issued?.deposit_paid ?? deal?.deposit_amount ?? 0),
      // Staff's answer wins once an estimate has been issued — they confirmed
      // it. Only before that is the address read, and it decides the municipal
      // land transfer tax the client cannot argue with, so it is read properly.
      isToronto:
        issued?.is_toronto !== null && issued?.is_toronto !== undefined
          ? issued.is_toronto === true
          : isTorontoAddress(deal?.property_address),
      titlePremiumOverride: optional(issued?.title_premium_override),
      propertyTaxAdjustment,
      fileNo: (issued?.file_no_display as string | null) ?? deal?.file_number ?? null,
      purchasers: (issued?.purchasers as string | null) ?? fullName ?? null,
      propertyAddress:
        (issued?.property_address as string | null) ??
        deal?.property_address ??
        null,
      closingDate:
        (issued?.closing_date as string | null) ?? deal?.closing_date ?? null,
    },
    isFirstTimeBuyer: issued?.is_first_time_buyer === true,
    mortgage: num(issued?.mortgage_amount ?? 0),
    emailTo: client.email ?? null,
  };

  return { ok: true, context };
}
