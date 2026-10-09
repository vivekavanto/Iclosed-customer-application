import { quoteSideFromLeadType } from "../quotePricing";
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

  it("uses the refinance and new condo wording", () => {
    const refi = buildQuoteEmailHtml({ ...base, side: "refinance", disbursementsLabel: "Disbursements" });
    expect(refi.subject).toBe("Your refinance quote for 424 Calderstone Crescent");
    expect(refi.html).toContain("Thanks for thinking of us for your refinance.");
    expect(refi.html).toContain("your quote sets it out separately.");
    const condo = buildQuoteEmailHtml({ ...base, side: "condo" });
    expect(condo.subject).toBe("Your new condo quote for 424 Calderstone Crescent");
    expect(condo.html).toContain("Congratulations on your new condo.");
    expect(condo.html).toContain("Those are our fees for your occupancy and final closing, before HST.");
  });

  it("uses the sale and purchase bundle wording", () => {
    const { subject, html } = buildQuoteEmailHtml({
      ...base,
      side: "both",
      propertyShort: "424 Calderstone Crescent and 1 New Home Road",
      legalFees: 2198,
      disbursements: 1200,
      bundle: { saleProperty: "424 Calderstone Crescent", purchaseProperty: "1 New Home Road", discount: 100 },
    });
    expect(subject).toBe("Your sale and purchase quote for 424 Calderstone Crescent and 1 New Home Road");
    expect(html).toContain("Congratulations on your sale and your new home.");
    expect(html).toMatch(/selling <strong[^>]*>424 Calderstone Crescent<\/strong> and buying <strong[^>]*>1 New Home Road<\/strong>/);
    expect(html).toContain("Legal fees, both closings");
    expect(html).toContain("$2,198.00");
    expect(html).toContain("They include $100 off because we are closing both.");
    expect(html).toContain("That opens your two retainers, one for the sale and one for the purchase");
    expect(html).toContain("every step of both closings");
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
