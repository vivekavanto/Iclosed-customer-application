import { parseRows, serializeRows } from "@/components/dashboard/RepeaterRows";

describe("repeater rows", () => {
  it("round-trips rows as readable lines", () => {
    const text = serializeRows([["Hot water tank", "Enercare", "123"], ["", "", ""], ["Furnace", "Reliance", ""]]);
    expect(text).toBe("Hot water tank | Enercare | 123\nFurnace | Reliance");
    expect(parseRows(text, 3)).toEqual([["Hot water tank", "Enercare", "123"], ["Furnace", "Reliance", ""]]);
  });

  it("reads old free text into the first column", () => {
    expect(parseRows("Furnace — Reliance", 3)).toEqual([["Furnace — Reliance", "", ""]]);
    expect(parseRows("", 3)).toEqual([["", "", ""]]);
  });
});
