import { resolveStatusSteps } from "../statusSteps";

describe("resolveStatusSteps", () => {
  it("groups milestones and marks the first open step current", () => {
    const steps = resolveStatusSteps("purchase", [
      { title: "Initial Call", done: true },
      { title: "Agreement of Purchase and Sale", done: true },
      { title: "Personal Information", done: true },
      { title: "Identification", done: false },
      { title: "Title Search", done: false },
    ]);
    expect(steps.map((s) => s.title)).toEqual([
      "Agreement received",
      "Your information and ID",
      "Title search",
      "Mortgage instructions",
      "Home insurance",
      "Signing appointment",
      "Closing funds",
      "Purchase complete",
      "Final report",
    ]);
    expect(steps.slice(0, 2).map((s) => [s.done, s.current])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(steps.filter((s) => s.current)).toHaveLength(1);
  });

  it("uses the sale order, with sale complete before proceeds", () => {
    const steps = resolveStatusSteps("sale", []);
    expect(steps.map((s) => s.title)).toEqual([
      "Agreement received",
      "Your information and ID",
      "Mortgage payout statement",
      "Property tax and rentals",
      "Signing appointment",
      "Sale complete",
      "Proceeds sent to you",
      "Final report",
    ]);
    expect(steps[0]).toMatchObject({ done: false, current: true });
  });

  it("completes property tax and rentals only when both milestones are done", () => {
    const step = (taxDone: boolean, rentalDone: boolean) =>
      resolveStatusSteps("sale", [
        { title: "Latest Property Tax Bill", done: taxDone },
        { title: " Rental Equipment Information", done: rentalDone },
      ]).find((s) => s.title === "Property tax and rentals")!;
    expect(step(true, false).done).toBe(false);
    expect(step(false, true).done).toBe(false);
    expect(step(true, true).done).toBe(true);
  });

  it("keeps final report separate from purchase complete", () => {
    const steps = resolveStatusSteps("purchase", [
      { title: "Transaction Completed", done: true },
      { title: "Final Report Received", done: false },
    ]);
    expect(steps.find((s) => s.title === "Purchase complete")?.done).toBe(true);
    expect(steps.find((s) => s.title === "Final report")?.done).toBe(false);
  });
});
