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
 * live file, including retainers already signed.
 */
export const DEFAULT_FIRM_KEY: FirmKey = "navawilson";

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
    fromEmail: "iClosed <support@iclosed.ca>",
    replyToEmail: "support@iclosed.ca",
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
 * Coerce anything read out of the database to a firm.
 *
 * NULL is expected and normal: rows written before the firm_key column existed
 * read as null. They are Nava Wilson files — see DEFAULT_FIRM_KEY.
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
