import { cityIn } from "@/lib/cityMatch";

describe("cityIn", () => {
  const cities = ["toronto", "hamilton", "ottawa"];
  it("matches each city and its former municipalities", () => {
    expect(cityIn("Toronto", cities)).toBe(true);
    expect(cityIn("North York", cities)).toBe(true);
    expect(cityIn("Stoney Creek", cities)).toBe(true);
    expect(cityIn("Kanata", cities)).toBe(true);
  });
  it("skips other cities", () => {
    expect(cityIn("Burlington", cities)).toBe(false);
    expect(cityIn("Mississauga", cities)).toBe(false);
    expect(cityIn(null, cities)).toBe(false);
  });
});
