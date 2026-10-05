// Lookups against the data built from "Utility Dept Contact Info.docx".
import { utilityContactsFor } from "../utilityContacts";

describe("utilityContactsFor", () => {
  it("finds Toronto with tax and water notified, hydro called", () => {
    const t = utilityContactsFor("Toronto")!;
    expect(t.rows.find((r) => r.service === "Property tax and water")?.clientCalls).toBe(false);
    expect(t.rows.find((r) => r.service === "Hydro")).toMatchObject({ provider: "Toronto Hydro", clientCalls: true });
  });

  it("matches a community inside a combined entry", () => {
    expect(utilityContactsFor("Courtice")?.name).toBe("Clarington/Newcastle/Courtice");
    expect(utilityContactsFor("Town of East Gwillimbury")?.name).toBe("Town of East Gwillimbury");
    expect(utilityContactsFor("St. Catharines")?.name).toBe("St. Catherines");
    expect(utilityContactsFor("Sault Ste Marie")?.name).toBe("Sault Ste. Marie");
  });

  it("flags municipalities that take no law-office notices", () => {
    expect(utilityContactsFor("Mississauga")?.clientContactsAll).toBe(true);
  });

  it("returns null for an unknown city", () => {
    expect(utilityContactsFor("Atlantis")).toBeNull();
    expect(utilityContactsFor(null)).toBeNull();
  });
});
