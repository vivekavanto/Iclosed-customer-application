// The intake wizard's step list — the single source of truth for both the
// order of the steps and the labels rendered in each step's left-hand progress
// rail.
//
// This used to be a `leftSteps` array copy-pasted into Step1, Step2, Step4 and
// Step5Contact. Reordering the flow meant editing four identical arrays, and
// missing one left the rail disagreeing with itself on a single screen. Import
// this instead.
//
// NOTE ON ORDER: the Agreement step (Step4.tsx) comes BEFORE Price & Address
// (Step2.tsx). The APS is uploaded at step 2 so its contents can prefill the
// price, deposit, address and closing date on step 3 and the co-person / agent
// names on step 4. The component file names predate this order — Step4.tsx is
// step 2, Step2.tsx is step 3 — so trust the ids here, not the filenames.

export interface IntakeStep {
  id: number;
  label: string;
}

export const INTAKE_STEPS: IntakeStep[] = [
  { id: 1, label: "Select Service" },
  { id: 2, label: "Agreement" },
  { id: 3, label: "Price & Address" },
  { id: 4, label: "Contact Info" },
];

// Step ids, named so navigation reads as intent rather than a magic number.
export const STEP_SERVICE = 1;
export const STEP_AGREEMENT = 2;
export const STEP_PRICE_ADDRESS = 3;
export const STEP_CONTACT = 4;
