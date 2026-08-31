/**
 * An agreement is a package, not a file.
 *
 * The intake used to read only the first document a client uploaded, which
 * meant an amended price, and a purchaser added by amendment, never reached the
 * form at all — the client saw a half-filled page with no indication that we
 * had ignored two of the three files they gave us.
 *
 * These cover the two decisions that fixes: how the reads are layered, and who
 * out of the resulting party list is the person the file is opened for.
 */

import {
  EMPTY_EXTRACTION_RESULT,
  mergeApsExtractions,
  type ApsExtractionResult,
} from "@/lib/apsExtraction";
import { partiesForSide, splitPrimaryParty } from "@/lib/apsPrefill";

const value = (v: string | null) => ({ value: v, confidence: "high" as const });

function doc(over: Partial<ApsExtractionResult> = {}): ApsExtractionResult {
  return { ...EMPTY_EXTRACTION_RESULT, is_aps: true, document_type: "aps", ...over };
}

const parties = (...names: string[]) => names.map((full_name) => ({ full_name }));

describe("mergeApsExtractions", () => {
  it("returns an empty result for no documents", () => {
    expect(mergeApsExtractions([]).is_aps).toBe(false);
  });

  it("keeps the agreement's values when an amendment is silent on them", () => {
    const aps = doc({
      purchase_price: value("870000"),
      deposit: value("43500"),
      closing_date: value("2026-09-16"),
    });
    const amendment = doc({
      document_type: "amendment",
      closing_date: value("2026-10-30"),
    });

    const merged = mergeApsExtractions([aps, amendment]);

    expect(merged.purchase_price.value).toBe("870000");
    expect(merged.deposit.value).toBe("43500");
    expect(merged.closing_date.value).toBe("2026-10-30");
  });

  it("lets an amendment win even when it was uploaded first", () => {
    const amendment = doc({
      document_type: "amendment",
      purchase_price: value("905000"),
    });
    const aps = doc({ purchase_price: value("870000") });

    expect(mergeApsExtractions([amendment, aps]).purchase_price.value).toBe("905000");
  });

  it("adds a purchaser named only on an amendment", () => {
    const aps = doc({ buyers: parties("Rehana M Haneef", "Mohammed Haneef Mugdi") });
    const amendment = doc({
      document_type: "amendment",
      buyers: parties("Marwa Haneef"),
    });

    const merged = mergeApsExtractions([aps, amendment]);

    expect(merged.buyers.map((b) => b.full_name)).toEqual([
      "Rehana M Haneef",
      "Mohammed Haneef Mugdi",
      "Marwa Haneef",
    ]);
  });

  it("does not list a party twice when an amendment restates the buyers", () => {
    const aps = doc({ buyers: parties("Rehana M Haneef") });
    const amendment = doc({
      document_type: "amendment",
      buyers: parties("rehana m haneef", "Marwa Haneef"),
    });

    expect(mergeApsExtractions([aps, amendment]).buyers).toHaveLength(2);
  });

  it("fills address components from whichever document carries them", () => {
    const aps = doc({
      property_address: {
        street: "88 Frey Crescent",
        unit: null,
        city: "Toronto",
        province: "Ontario",
        postal_code: null,
        confidence: "high",
      },
    });
    const schedule = doc({
      document_type: "schedule",
      property_address: {
        street: null,
        unit: null,
        city: null,
        province: null,
        postal_code: "M1R 2C8",
        confidence: "high",
      },
    });

    const merged = mergeApsExtractions([aps, schedule]);

    expect(merged.property_address.street).toBe("88 Frey Crescent");
    expect(merged.property_address.city).toBe("Toronto");
    expect(merged.property_address.postal_code).toBe("M1R 2C8");
  });

  it("ignores a file that isn't part of the transaction", () => {
    const aps = doc({ buyers: parties("Kejda Trungu"), purchase_price: value("870000") });
    const strayId = { ...EMPTY_EXTRACTION_RESULT, reason: "driver's licence" };

    const merged = mergeApsExtractions([aps, strayId]);

    expect(merged.purchase_price.value).toBe("870000");
    expect(merged.buyers).toHaveLength(1);
  });
});

describe("splitPrimaryParty", () => {
  it("takes the first party as the client and the rest as co-parties", () => {
    const { primary, others } = splitPrimaryParty([
      "Rehana M Haneef",
      "Mohammed Haneef Mugdi",
      "Marwa Haneef",
    ]);

    expect(primary).toBe("Rehana M Haneef");
    expect(others).toEqual(["Mohammed Haneef Mugdi", "Marwa Haneef"]);
  });

  it("leaves no co-parties for a single-purchaser agreement", () => {
    expect(splitPrimaryParty(["Kejda Trungu"])).toEqual({
      primary: "Kejda Trungu",
      others: [],
    });
  });

  it("has nothing to say about an agreement with no parties read", () => {
    expect(splitPrimaryParty([])).toEqual({ primary: null, others: [] });
  });

  it("reads the buyers on a purchase and the sellers on a sale", () => {
    const agreement = doc({
      buyers: parties("Kejda Trungu"),
      sellers: parties("Aliya Vendor"),
    });

    expect(partiesForSide(agreement, "purchase")).toEqual({
      role: "purchaser",
      names: ["Kejda Trungu"],
    });
    expect(partiesForSide(agreement, "sale")).toEqual({
      role: "seller",
      names: ["Aliya Vendor"],
    });
  });
});
