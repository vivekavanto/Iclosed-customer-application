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
    expect(steps).toHaveLength(10);
    expect(steps.slice(0, 3).map((s) => [s.title, s.done, s.current])).toEqual([
      ["File opened", true, false],
      ["Agreement received", true, false],
      ["Your information and ID", false, true],
    ]);
    expect(steps.filter((s) => s.current)).toHaveLength(1);
  });

  it("leaves steps with no milestones open, except File opened", () => {
    const steps = resolveStatusSteps("sale", []);
    expect(steps[0].done).toBe(true);
    expect(steps[1]).toMatchObject({ title: "Agreement received", done: false, current: true });
    expect(steps.map((s) => s.title)).toContain("Proceeds sent to you");
  });
});
