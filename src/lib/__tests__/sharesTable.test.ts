import { formatShares, minorityNames, sharesFor, sharesTotal, withRemainder } from "@/components/dashboard/SharesTable";

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

describe("withRemainder", () => {
  const rows = [{ name: "A", percent: "" }, { name: "B", percent: "" }];
  it("fills the other share for two owners", () => {
    expect(withRemainder(rows, 0, "60")).toEqual([{ name: "A", percent: "60" }, { name: "B", percent: "40" }]);
  });
  it("leaves three owners alone", () => {
    const three = [...rows, { name: "C", percent: "" }];
    expect(withRemainder(three, 0, "50").map((r) => r.percent)).toEqual(["50", "", ""]);
  });
});
