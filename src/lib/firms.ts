/**
 * The two law firms iClosed serves clients under — MIRROR of the admin app's
 * `iclosed_dev_admin/src/lib/firms.ts`.
 *
 * Which firm a file belongs to is a per-file label an admin sets on the lead
 * (`leads.firm_key`) in the admin app. Both apps read that column out of the
 * SAME database, so the keys and the legal names here must not drift from the
 * admin copy. Anything the portal alone needs (the retainer's PDF lockup, its
 * wording) lives here; anything the admin alone needs (email env var names)
 * lives there.
 *
 * In this repo the firm decides:
 *   • the retainer agreement's logo, its "Who are we?" answers and the entity
 *     named on the "I agree to retain ___" line
 *   • the address the portal's own automated mail is sent from
 *
 * The intake form, the file number and the portal itself are shared. This is a
 * branding split, not a tenancy split — and intake is still one URL for both
 * firms, which is why the default below matters.
 */

/** The stored value of `leads.firm_key`. */
export type FirmKey = "navawilson" | "iclosed";

/**
 * The firm a lead belongs to when nothing says otherwise.
 *
 * Nava Wilson, because it is what every file was BEFORE this feature existed:
 * the retainer already named Nava Wilson PC and its lockup is the "iClosed —
 * POWERED BY NAVA WILSON" artwork. Anything else would silently re-brand every
 * file this constant covers.
 *
 * It covers less than it looks like. `leads.firm_key` is NOT NULL, so every
 * stored file already says which firm it is and reaches this only when a lookup
 * FAILS (a row that was not selected, a deal with no lead) or returns something
 * unrecognised. What stamps a NEW file is the column DEFAULT, which is also
 * 'navawilson' — the portal's intake insert does not name a firm.
 *
 * ⚠ MIRROR of the admin app's DEFAULT_FIRM_KEY, and the two MUST match: both
 * repos resolve `leads.firm_key` out of the SAME database, so while they
 * disagree a file this constant covers is branded as one firm by the portal and
 * the other by the admin app. Changing it here means changing it there, and
 * moving the column default (admin
 * migrations/2026-09-08-default-firm-iclosed.sql) in the same release.
 *
 * ⚠ SENDING ADDRESS. Whichever firm this resolves to also decides the address
 * outbound client mail is sent from, and `navawilson.law` is NOT a verified
 * sending domain in Resend — it answered 403 to every message relayed through
 * it. `EMAIL_FROM_NAVAWILSON` / `EMAIL_REPLY_TO_NAVAWILSON` must stay pointed
 * at the verified support@iclosed.ca until that domain is verified, otherwise
 * mail on Nava Wilson files silently stops. See firmEmail.ts.
 */
export const DEFAULT_FIRM_KEY: FirmKey = "iclosed";

export interface FirmProfile {
  key: FirmKey;
  /** Short label, for anywhere the firm is named in the UI. */
  label: string;
  /**
   * The legal entity, spelled as it must appear in client-facing prose — the
   * retainer's "I agree to retain ___" line and its binding-agreement answer.
   */
  legalName: string;
  /** How the firm introduces itself in the retainer's "Who are we?" answer. */
  introName: string;
  /**
   * The entity as it signs off an email footer. Spelled out in full for Nava
   * Wilson because that is the wording already in front of clients — the
   * footer is not the place to start abbreviating a law firm's name.
   */
  footerName: string;
  /** Resend `from`: display name + address. */
  fromEmail: string;
  /** Where a client's reply actually lands. */
  replyToEmail: string;
  /**
   * The telephone number the PORTAL shows a client under "Need Assistance?".
   *
   * Per-firm because a client reads it, even though both values are the same
   * number today: iClosed works out of the Nava Wilson office, so the
   * switchboard is shared — SHARED_LETTERHEAD in closingCostSettings.ts prints
   * this same number on both firms' statements. It is a field rather than a
   * shared constant so that the day iClosed LLP takes its own line, the portal
   * follows by editing one string here.
   */
  supportPhone: string;
  /**
   * The address the PORTAL tells a client to write to.
   *
   * Deliberately its own field rather than a reuse of `fromEmail` /
   * `replyToEmail`: those two are ROUTING, and `fromEmail` in particular is
   * constrained by which domains Resend has verified — which is no reason to
   * print the wrong address in front of a client. It must still be a mailbox
   * the firm's clerks actually read.
   */
  supportEmail: string;
  /**
   * Brand lockup for the retainer PDF, read from this app's `public/`, plus
   * the geometry to draw it at.
   *
   * The numbers are per-firm because the two files are cropped completely
   * differently, and they are MEASURED, not guessed:
   *
   *     file            size      wordmark is...  padding above/below
   *     logo-full.png   1108x480  41% of height   16% / 21%
   *     logo.png          90x29   79% of height   14% /  7%
   *
   * Each `height` is chosen so the word "iClosed" measures the ~22pt it has
   * rendered at since this document existed (54 x 0.41 and 28 x 0.79 both
   * land there); each `lift` then cancels that file's own built-in
   * whitespace so the ink starts on the same line either way. `gap` is what
   * the cursor advances by afterwards — larger for the bare wordmark, which
   * carries no tagline of its own to fill the space.
   *
   * `inkLeft` is the transparent padding on the file’s LEFT edge as a
   * fraction of its width. Both files carry some, so drawing either at
   * x = margin would push the wordmark right of the heading under it; the
   * renderer subtracts `logoWidth * inkLeft` to line the ink up with the
   * left margin.
   *
   * Re-measure all four if either file is re-cropped.
   */
  pdfLogo: {
    file: string;
    /** Drawn height, in points. */
    height: number;
    /** drawImage y = cursor - height + lift. */
    lift: number;
    /** Extra advance below the image, in points. */
    gap: number;
    /** Left transparent padding, as a fraction of the file’s width. */
    inkLeft: number;
  };
  /**
   * FILENAME of the firm's email lockup as it appears in the shared
   * `email_templates` rows. Only the filename, never a URL: the images are
   * served by the ADMIN app, and emailBrand.ts swaps the filename inside the
   * template's existing src so the origin stays whatever the row already had.
   * Must match FIRMS[...].logoPath in the admin app's firms.ts.
   */
  emailLogoFile: string;
  /**
   * Rendered width of that lockup, in px. Per-firm because the two files are
   * cropped differently and a shared width would render the wordmark at two
   * different sizes — see FirmProfile.logoWidth in the admin app for the
   * arithmetic. Must match the admin app's value.
   */
  emailLogoWidth: number;
  /** Env vars that override the two addresses per deployment. */
  fromEnvVar: string;
  replyToEnvVar: string;
}

export const FIRMS: Record<FirmKey, FirmProfile> = {
  navawilson: {
    key: "navawilson",
    label: "Nava Wilson",
    legalName: "Nava Wilson PC",
    introName: "iClosed, powered by Nava Wilson PC",
    footerName: "Nava Wilson Professional Corporation",
    fromEmail: "iClosed <iclosed@navawilson.law>",
    replyToEmail: "iclosed@navawilson.law",
    supportPhone: "416-321-1100",
    supportEmail: "iclosed@navawilson.law",
    // Ink starts at pixel 87 of 1108 across, 16% down.
    pdfLogo: { file: "logo-full.png", height: 54, lift: 13, gap: 2, inkLeft: 87 / 1108 },
    emailLogoFile: "email-logo.png",
    emailLogoWidth: 85,
    fromEnvVar: "EMAIL_FROM_NAVAWILSON",
    replyToEnvVar: "EMAIL_REPLY_TO_NAVAWILSON",
  },
  iclosed: {
    key: "iclosed",
    label: "iClosed LLP",
    legalName: "iClosed LLP",
    introName: "iClosed LLP",
    footerName: "iClosed LLP",
    fromEmail: "iClosed <hello@iclosed.ca>",
    replyToEmail: "hello@iclosed.ca",
    supportPhone: "416-321-1100",
    supportEmail: "hello@iclosed.ca",
    // The bare iClosed wordmark. Intentionally NOT logo-full.png — that
    // lockup carries the "POWERED BY NAVA WILSON" tagline, which is exactly
    // what an iClosed LLP retainer must not say. Note the artwork reads
    // "iClosed", not "iClosed LLP"; the entity is spelled out in the copy.
    // Ink starts at pixel 2 of 90 across.
    pdfLogo: { file: "logo.png", height: 28, lift: 8, gap: 16, inkLeft: 2 / 90 },
    emailLogoFile: "logo.png",
    emailLogoWidth: 60,
    fromEnvVar: "EMAIL_FROM_ICLOSED",
    replyToEnvVar: "EMAIL_REPLY_TO_ICLOSED",
  },
};

/** True for a value that is a real firm key. */
export function isFirmKey(value: unknown): value is FirmKey {
  return typeof value === "string" && value in FIRMS;
}

/**
 * Coerce anything read out of the database (or off a request body) to a firm.
 *
 * NULL should no longer occur — the column is NOT NULL with a CHECK constraint —
 * but this stays tolerant because a lookup can still hand us undefined (a row
 * that was not selected, a deal with no lead). Anything unrecognised resolves to
 * DEFAULT_FIRM_KEY, which is Nava Wilson; a file that must be iClosed LLP says
 * so in its own column and never reaches this fallback.
 */
export function resolveFirmKey(value: unknown): FirmKey {
  return isFirmKey(value) ? value : DEFAULT_FIRM_KEY;
}

/** The profile for a firm key, tolerating null/garbage. */
export function getFirm(value: unknown): FirmProfile {
  return FIRMS[resolveFirmKey(value)];
}

// The env-aware address helpers live in firmEmail.ts, NOT here: this module
// is imported by the retainer page and by closingEstimateEmail.ts, both of
// which run in the browser, and neither may drag `process.env` lookups into
// the client bundle. Everything above is plain data.
