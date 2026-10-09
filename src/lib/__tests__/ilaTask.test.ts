jest.mock("@/lib/supabaseAdmin", () => ({ __esModule: true, default: {} }));
import { ilaName, minorityOwners } from "@/lib/ilaTask";

describe("ILA task", () => {
  it("finds owners below the largest share", () => {
    expect(minorityOwners("KDP Test — 30%; RDP Test — 70%")).toEqual(["KDP Test"]);
    expect(minorityOwners("A — 50%; B — 50%")).toEqual([]);
    expect(minorityOwners("A — 20%; B — 20%; C — 60%")).toEqual(["A", "B"]);
  });

  it("reads the name off the task title", () => {
    expect(ilaName("Independent legal advice for Alex")).toBe("Alex");
    expect(ilaName("Ownership shares")).toBeNull();
  });
});
