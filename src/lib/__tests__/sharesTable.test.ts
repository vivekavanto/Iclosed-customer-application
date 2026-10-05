import { formatShares, minorityNames, sharesFor, sharesTotal } from "@/components/dashboard/SharesTable";

describe("proceeds shares", () => {
  const names = ["Riley Dawson", "Kai Dawson"];

  it("keeps the sellers' order and totals the split", () => {
    const rows = sharesFor(names, "Kai Dawson — 70%; Riley Dawson — 30%");
    expect(rows).toEqual([{ name: "Riley Dawson", percent: "30" }, { name: "Kai Dawson", percent: "70" }]);
    expect(sharesTotal(rows)).toBe(100);
    expect(formatShares(rows)).toBe("Riley Dawson — 30%; Kai Dawson — 70%");
  });

  it("names the minority seller only when shares differ", () => {
    expect(minorityNames(sharesFor(names, "Riley Dawson — 30%; Kai Dawson — 70%"))).toEqual(["Riley Dawson"]);
    expect(minorityNames(sharesFor(names, "Riley Dawson — 50%; Kai Dawson — 50%"))).toEqual([]);
  });
});
