import { DEFAULT_RATES } from "../closingCosts";
import { quoteFigures, quoteSideFromLeadType } from "../quotePricing";
import { buildQuoteEmailHtml } from "../email-templates/quote";
import { signQuoteToken, verifyQuoteToken } from "../quoteToken";

describe("quoteSideFromLeadType", () => {
  it("maps intake lead types", () => {
    expect(quoteSideFromLeadType("Purchase")).toBe("buying");
    expect(quoteSideFromLeadType("Sale")).toBe("selling");
    expect(quoteSideFromLeadType("Purchase & Sale")).toBe("both");
    expect(quoteSideFromLeadType("Refinance")).toBe("refinance");
    expect(quoteSideFromLeadType("Condo")).toBe("condo");
    expect(quoteSideFromLeadType("Other")).toBeNull();
  });
});

describe("quoteFigures (refinance and condo only)", () => {
  it("prices a refinance with mortgage registration", () => {
    // 150 + 250 + 54.80 + 133.60 + 85
    expect(quoteFigures("refinance", DEFAULT_RATES)).toEqual({ legalFees: 999, disbursements: 673.4 });
  });

  it("totals condo occupancy and final closing, not the optional review", () => {
    expect(quoteFigures("condo", DEFAULT_RATES).legalFees).toBe(1699);
  });
});

describe("buildQuoteEmailHtml", () => {
  const base = {
    firmKey: "navawilson" as const,
    firstName: "Sam",
    side: "buying" as const,
    propertyShort: "424 Calderstone Crescent",
    propertyFull: "424 Calderstone Crescent, Toronto",
    legalFees: 1199,
    disbursements: 715,
    disbursementsLabel: "Estimated disbursements",
    quoteUrl: "https://example.com/login",
    siteUrl: "https://example.com",
  };

  it("fills in the client, property and figures", () => {
    const { subject, html } = buildQuoteEmailHtml(base);
    expect(subject).toBe("Your purchase quote for 424 Calderstone Crescent");
    expect(html).toContain("Hi Sam,");
    expect(html).toContain("Congratulations on your purchase.");
    expect(html).toContain("Estimated disbursements");
    expect(html).toContain("424 Calderstone Crescent, Toronto");
    expect(html).toContain("$1,199.00");
    expect(html).toContain("$715.00");
    expect(html).toContain("iClosed, powered by Nava Wilson PC");
  });

  it("uses the sale subject and fee sentence", () => {
    const { subject, html } = buildQuoteEmailHtml({ ...base, side: "selling", disbursementsLabel: "Disbursements" });
    expect(subject).toBe("Your sale quote for 424 Calderstone Crescent");
    expect(html).toContain("Congratulations on your sale.");
    expect(html).toContain("They come out of your sale proceeds, so you pay nothing upfront.");
  });

  it("escapes user-supplied values", () => {
    const { html } = buildQuoteEmailHtml({ ...base, firstName: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("quote token", () => {
  const OLD = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  });
  afterAll(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = OLD;
  });

  it("round-trips a lead id", () => {
    expect(verifyQuoteToken(signQuoteToken("lead-123"))).toBe("lead-123");
  });

  it("rejects tampered tokens", () => {
    const [payload] = signQuoteToken("lead-123").split(".");
    expect(verifyQuoteToken(`${payload}.forged`)).toBeNull();
    expect(verifyQuoteToken(`${Buffer.from("other").toString("base64url")}.${signQuoteToken("lead-123").split(".")[1]}`)).toBeNull();
  });
});
